from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.models import User
from rest_framework import status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.views import exception_handler as drf_exception_handler

from . import ipo, market
from django.db.models import Count, Sum

from .models import Holding, Member, MutualFund, Profile, SipEntry
from .serializers import (
    HoldingSerializer,
    MemberSerializer,
    MutualFundSerializer,
    SipEntrySerializer,
    actor_permissions,
    ensure_default_member,
    is_owner_member,
    portfolio_owner,
    serialize_account,
)

UserModel = get_user_model()


def folio_exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    if response is None:
        return Response({"error": str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    data = response.data
    if isinstance(data, dict):
        if "detail" in data:
            response.data = {"error": str(data["detail"])}
        else:
            first = next(iter(data.values()), "Request failed")
            if isinstance(first, list):
                first = first[0]
            if isinstance(first, dict):
                first = next(iter(first.values()), first)
                if isinstance(first, list):
                    first = first[0]
            response.data = {"error": str(first)}
    else:
        response.data = {"error": str(data)}
    return response


def authenticate_email(request, email: str, password: str):
    user = authenticate(request, username=email, password=password)
    if user:
        return user
    found = UserModel.objects.filter(email__iexact=email).first()
    if not found:
        return None
    return authenticate(request, username=found.username, password=password)


class IsPortfolioAdmin(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and actor_permissions(request.user)["canManageMembers"])


class CanEditPortfolio(BasePermission):
    def has_permission(self, request, view):
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return bool(request.user and request.user.is_authenticated)
        return bool(request.user and request.user.is_authenticated and actor_permissions(request.user)["canEdit"])


class LoginView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        email = str(request.data.get("email") or "").strip()
        password = str(request.data.get("password") or "")
        if not email or not password:
            return Response({"error": "Email and password are required."}, status=400)
        user = authenticate_email(request, email, password)
        if not user or not user.is_active:
            return Response({"error": "Incorrect email or password."}, status=400)
        member = getattr(user, "member_profile", None)
        if member is not None and not member.can_login:
            return Response({"error": "Login is disabled for this member."}, status=400)
        if getattr(user, "member_profile", None) is None:
            ensure_default_member(user)
        token, _ = Token.objects.get_or_create(user=user)
        return Response({"token": token.key, "account": serialize_account(user, request)})


class LogoutView(APIView):
    def post(self, request):
        Token.objects.filter(user=request.user).delete()
        return Response({"ok": True})


class MeView(APIView):
    def get(self, request):
        if actor_permissions(request.user)["isAdmin"]:
            ensure_default_member(request.user)
        return Response(serialize_account(request.user, request))

    def patch(self, request):
        perms = actor_permissions(request.user)
        if not perms["isAdmin"]:
            return Response({"error": "Only the admin can update account profile details."}, status=403)
        user = request.user
        name = str(request.data.get("name") or "").strip()
        email = str(request.data.get("email") or "").strip()
        phone = str(request.data.get("phone") or "").strip()
        if not name or not email:
            return Response({"error": "Name and email are required."}, status=400)
        if User.objects.exclude(pk=user.pk).filter(email__iexact=email).exists():
            return Response({"error": "That email is already in use."}, status=400)
        user.first_name = name
        user.last_name = ""
        user.email = email
        if user.username != email:
            user.username = email
        user.save()
        profile, _ = Profile.objects.get_or_create(user=user, defaults={"role": "Administrator"})
        profile.phone = phone
        profile.save(update_fields=["phone"])
        ensure_default_member(user)
        return Response(serialize_account(user, request))


class PasswordView(APIView):
    def post(self, request):
        current = str(request.data.get("current") or "")
        nxt = str(request.data.get("next") or "")
        if not request.user.check_password(current):
            return Response({"error": "Your current password is incorrect."}, status=400)
        if len(nxt) < 8:
            return Response({"error": "New password must be at least 8 characters."}, status=400)
        request.user.set_password(nxt)
        request.user.save()
        Token.objects.filter(user=request.user).delete()
        token = Token.objects.create(user=request.user)
        return Response({"token": token.key, "account": serialize_account(request.user, request)})


class MemberViewSet(viewsets.ModelViewSet):
    serializer_class = MemberSerializer
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_permissions(self):
        if self.action in ("create", "destroy"):
            return [IsAuthenticated(), IsPortfolioAdmin()]
        if self.action in ("update", "partial_update", "upload_image"):
            return [IsAuthenticated(), IsPortfolioAdmin()]
        return [IsAuthenticated()]

    def get_queryset(self):
        return Member.objects.filter(user=portfolio_owner(self.request.user))

    def list(self, request, *args, **kwargs):
        # Ensure owner member exists once when listing, without slowing every queryset use.
        ensure_default_member(portfolio_owner(request.user))
        return super().list(request, *args, **kwargs)

    def perform_destroy(self, instance):
        owner = instance.user
        if is_owner_member(instance):
            raise ValidationError("The account owner member cannot be removed.")
        if Member.objects.filter(user=owner).count() <= 1:
            raise ValidationError("At least one member is required.")
        auth_user = instance.auth_user
        instance.delete()
        if auth_user is not None:
            auth_user.delete()
        ensure_default_member(owner)

    @action(detail=True, methods=["post"], url_path="image")
    def upload_image(self, request, pk=None):
        member = self.get_object()
        image = request.FILES.get("image")
        if image is None:
            return Response({"error": "Choose an image to upload."}, status=400)
        if not str(getattr(image, "content_type", "")).startswith("image/"):
            return Response({"error": "File must be an image."}, status=400)
        if image.size > 5 * 1024 * 1024:
            return Response({"error": "Image must be smaller than 5 MB."}, status=400)
        if member.image:
            member.image.delete(save=False)
        member.image = image
        member.save(update_fields=["image"])
        return Response(MemberSerializer(member, context={"request": request}).data)


class HoldingViewSet(viewsets.ModelViewSet):
    serializer_class = HoldingSerializer
    permission_classes = [IsAuthenticated, CanEditPortfolio]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        owner = portfolio_owner(self.request.user)
        return Holding.objects.filter(user=owner).select_related("member")

    def perform_create(self, serializer):
        serializer.save(user=portfolio_owner(self.request.user))

    def perform_update(self, serializer):
        serializer.save(user=portfolio_owner(self.request.user))


class MutualFundViewSet(viewsets.ModelViewSet):
    serializer_class = MutualFundSerializer
    permission_classes = [IsAuthenticated, CanEditPortfolio]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        owner = portfolio_owner(self.request.user)
        return (
            MutualFund.objects.filter(user=owner)
            .select_related("member")
            .prefetch_related("sips")
            .annotate(invested_total=Sum("sips__amount"), sip_total_count=Count("sips"))
        )

    def perform_create(self, serializer):
        serializer.save(user=portfolio_owner(self.request.user))


class SipEntryViewSet(viewsets.ModelViewSet):
    serializer_class = SipEntrySerializer
    permission_classes = [IsAuthenticated, CanEditPortfolio]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        owner = portfolio_owner(self.request.user)
        qs = SipEntry.objects.filter(mutual_fund__user=owner).select_related("mutual_fund")
        fund_id = self.request.query_params.get("mutualFundId")
        if fund_id:
            qs = qs.filter(mutual_fund_id=fund_id)
        return qs


class MarketOverviewView(APIView):
    def get(self, request):
        try:
            return Response(market.market_overview())
        except Exception as exc:
            return Response({"error": str(exc) or "Market data unavailable"}, status=502)


class NseMoversView(APIView):
    def get(self, request):
        index = request.query_params.get("index") or "gainers"
        return market.nse_get(
            f"https://www.nseindia.com/api/live-analysis-variations?index={index}",
            ttl=30,
            key=f"nse-movers-{index}",
        )


class NseEquitiesView(APIView):
    def get(self, request):
        return market.nse_get(
            "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv",
            ttl=6 * 60 * 60,
            key="nse-equities",
            accept="text/csv, */*",
        )


class StockSearchView(APIView):
    def get(self, request):
        query = (request.query_params.get("q") or "").strip()
        if len(query) < 2:
            return Response({"quotes": []})
        return market.proxy_json(
            "https://query2.finance.yahoo.com/v1/finance/search"
            f"?q={requests_quote(query)}&quotesCount=12&newsCount=0&listsCount=0",
            headers={"Accept": "application/json"},
            ttl=60,
            key=f"yahoo-{query.lower()}",
        )


class GrowwSearchView(APIView):
    def get(self, request):
        query = (request.query_params.get("q") or "").strip()
        if len(query) < 2:
            return Response({"content": []})
        return market.proxy_json(
            "https://groww.in/v1/api/search/v1/entity"
            f"?app=false&entity_type=Stocks&page=0&q={requests_quote(query)}&size=12&web=true",
            headers={"Referer": "https://groww.in/", "Accept": "application/json"},
            ttl=60,
            key=f"groww-search-{query.lower()}",
        )


class GrowwCompanyView(APIView):
    def get(self, request):
        search_id = (request.query_params.get("id") or "").strip()
        if not search_id:
            return Response({"error": "Missing id"}, status=400)
        return market.proxy_json(
            f"https://groww.in/v1/api/stocks_data/v1/company/search_id/{search_id}",
            headers={"Referer": "https://groww.in/", "Accept": "application/json"},
            ttl=6 * 60 * 60,
            key=f"groww-company-{search_id}",
        )


class MfSearchView(APIView):
    def get(self, request):
        query = (request.query_params.get("q") or "").strip()
        try:
            return Response({"results": market.mf_search(query)})
        except Exception as exc:
            return Response({"error": str(exc) or "Mutual fund search unavailable"}, status=502)


class MfSchemeView(APIView):
    def get(self, request):
        search_id = (request.query_params.get("id") or "").strip()
        if not search_id:
            return Response({"error": "Missing id"}, status=400)
        try:
            return Response(market.mf_scheme(search_id))
        except LookupError:
            return Response({"error": "Scheme not found"}, status=404)
        except Exception as exc:
            return Response({"error": str(exc) or "Scheme details unavailable"}, status=502)


class MfNavView(APIView):
    def get(self, request):
        scheme_code = (request.query_params.get("code") or "").strip()
        if not scheme_code:
            return Response({"error": "Missing code"}, status=400)
        try:
            return Response(market.mf_nav_history(scheme_code))
        except LookupError:
            return Response({"error": "Scheme not found"}, status=404)
        except Exception as exc:
            return Response({"error": str(exc) or "NAV history unavailable"}, status=502)


class StockQuoteView(APIView):
    def get(self, request, symbol: str):
        try:
            return Response(market.stock_quote(symbol))
        except LookupError:
            return Response({"error": "Stock not found"}, status=404)
        except Exception as exc:
            return Response({"error": str(exc) or "Quote unavailable"}, status=502)


class StockDetailView(APIView):
    def get(self, request):
        symbol = (request.query_params.get("symbol") or "").strip()
        search_id = (request.query_params.get("id") or "").strip()
        if not symbol and not search_id:
            return Response({"error": "Missing symbol"}, status=400)
        try:
            return Response(market.stock_detail(symbol, search_id))
        except LookupError:
            return Response({"error": "Stock not found"}, status=404)
        except Exception as exc:
            return Response({"error": str(exc) or "Stock details unavailable"}, status=502)


class StockHistoryView(APIView):
    def get(self, request):
        symbol = (request.query_params.get("symbol") or "").strip()
        if not symbol:
            return Response({"error": "Missing symbol"}, status=400)
        try:
            return Response(market.stock_price_history(symbol))
        except LookupError:
            return Response({"error": "Price history unavailable"}, status=404)
        except Exception as exc:
            return Response({"error": str(exc) or "Price history unavailable"}, status=502)


class IpoListView(APIView):
    def get(self, request):
        return ipo.live_ipos()


class IpoListedView(APIView):
    def get(self, request):
        from datetime import date
        raw = request.query_params.get("year") or ""
        try:
            year = int(raw) if raw else date.today().year
        except ValueError:
            year = date.today().year
        return ipo.listed_ipos(year)


class IpoDetailView(APIView):
    def get(self, request):
        slug = (request.query_params.get("slug") or "").strip()
        year = request.query_params.get("year")
        if not slug:
            return Response({"error": "Missing slug"}, status=400)
        return ipo.ipo_detail(slug, year)


class IpoSubscriptionView(APIView):
    def get(self, request):
        ipo_id = (request.query_params.get("id") or "").strip()
        if not ipo_id:
            return Response({"error": "Missing id"}, status=400)
        return ipo.ipo_subscription(ipo_id)


def requests_quote(value: str) -> str:
    from urllib.parse import quote

    return quote(value, safe="")
