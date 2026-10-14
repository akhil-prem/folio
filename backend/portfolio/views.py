from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.models import User
from rest_framework import status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.views import exception_handler as drf_exception_handler

from . import ipo, market
from .models import Holding, Member, Profile
from .serializers import MEMBER_COLORS, HoldingSerializer, MemberSerializer, serialize_account

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
        token, _ = Token.objects.get_or_create(user=user)
        return Response({"token": token.key, "account": serialize_account(user)})


class LogoutView(APIView):
    def post(self, request):
        Token.objects.filter(user=request.user).delete()
        return Response({"ok": True})


class MeView(APIView):
    def get(self, request):
        return Response(serialize_account(request.user))

    def patch(self, request):
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
        return Response(serialize_account(user))


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
        return Response({"token": token.key, "account": serialize_account(request.user)})


class MemberViewSet(viewsets.ModelViewSet):
    serializer_class = MemberSerializer
    http_method_names = ["get", "post", "delete", "head", "options"]

    def get_queryset(self):
        return Member.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        used = self.get_queryset().count()
        serializer.save(user=self.request.user, color=MEMBER_COLORS[used % len(MEMBER_COLORS)])


class HoldingViewSet(viewsets.ModelViewSet):
    serializer_class = HoldingSerializer
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        return Holding.objects.filter(user=self.request.user).select_related("member")

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def perform_update(self, serializer):
        serializer.save(user=self.request.user)


class MarketOverviewView(APIView):
    def get(self, request):
        return market.proxy_json(
            "https://downstox.com/api/india-markets/overview",
            ttl=20,
            key="market-overview",
        )


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


class StockQuoteView(APIView):
    def get(self, request, symbol: str):
        clean = symbol.strip().upper()
        return market.proxy_json(
            f"https://downstox.com/api/stocks/{clean}",
            ttl=45,
            key=f"stock-{clean}",
        )


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
