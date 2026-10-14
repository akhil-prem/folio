from django.http import HttpResponse
from rest_framework import status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from . import ipo, markets
from .models import Holding, Member
from .serializers import AccountSerializer, HoldingSerializer, MemberSerializer


def _account_payload(user, token=None):
    payload = {'account': AccountSerializer(user).data}
    if token is not None:
        payload['token'] = token
    return payload


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = str(request.data.get('email') or '').strip().lower()
        password = request.data.get('password') or ''
        from django.contrib.auth import authenticate
        user = authenticate(request, username=email, password=password)
        if user is None or not user.is_active:
            return Response({'error': 'Incorrect email or password. Please try again.'}, status=status.HTTP_401_UNAUTHORIZED)
        token, _ = Token.objects.get_or_create(user=user)
        return Response(_account_payload(user, token.key))


class LogoutView(APIView):
    def post(self, request):
        Token.objects.filter(user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    def get(self, request):
        return Response(AccountSerializer(request.user).data)

    def patch(self, request):
        serializer = AccountSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class PasswordView(APIView):
    def post(self, request):
        current = request.data.get('current') or ''
        nxt = request.data.get('next') or ''
        if not request.user.check_password(current):
            return Response({'error': 'Your current password is incorrect.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(nxt) < 8:
            return Response({'error': 'New password must be at least 8 characters.'}, status=status.HTTP_400_BAD_REQUEST)
        request.user.set_password(nxt)
        request.user.save(update_fields=['password'])
        Token.objects.filter(user=request.user).delete()
        token = Token.objects.create(user=request.user)
        return Response(_account_payload(request.user, token.key))


class MemberViewSet(viewsets.ModelViewSet):
    serializer_class = MemberSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'post', 'delete', 'head', 'options']

    def get_queryset(self):
        return Member.objects.filter(owner=self.request.user)


class HoldingViewSet(viewsets.ModelViewSet):
    serializer_class = HoldingSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        return Holding.objects.filter(owner=self.request.user).select_related('member')


class ProxyView(APIView):
    permission_classes = [IsAuthenticated]


class MarketOverviewView(ProxyView):
    def get(self, request):
        try:
            return Response(markets.market_overview())
        except Exception as exc:
            return Response({'error': str(exc) or 'Market data unavailable'}, status=status.HTTP_502_BAD_GATEWAY)


class StockQuoteView(ProxyView):
    def get(self, request, symbol):
        try:
            return Response(markets.stock_quote(symbol))
        except LookupError:
            return Response({'error': 'Stock not found'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as exc:
            return Response({'error': str(exc) or 'Quote unavailable'}, status=status.HTTP_502_BAD_GATEWAY)


class NseMoversView(ProxyView):
    def get(self, request):
        try:
            return Response(markets.nse_movers(request.query_params.get('index', 'gainers')))
        except Exception as exc:
            return Response({'error': str(exc) or 'NSE movers unavailable'}, status=status.HTTP_502_BAD_GATEWAY)


class NseEquitiesView(ProxyView):
    def get(self, request):
        try:
            body = markets.nse_equities_csv()
            return HttpResponse(body, content_type='text/csv; charset=utf-8')
        except Exception as exc:
            return Response({'error': str(exc) or 'NSE list unavailable'}, status=status.HTTP_502_BAD_GATEWAY)


class StockSearchView(ProxyView):
    def get(self, request):
        try:
            return Response(markets.yahoo_search(request.query_params.get('q', '')))
        except Exception as exc:
            return Response({'error': str(exc) or 'Search unavailable'}, status=status.HTTP_502_BAD_GATEWAY)


class GrowwSearchView(ProxyView):
    def get(self, request):
        try:
            return Response(markets.groww_search(request.query_params.get('q', '')))
        except Exception as exc:
            return Response({'error': str(exc) or 'Search unavailable'}, status=status.HTTP_502_BAD_GATEWAY)


class GrowwCompanyView(ProxyView):
    def get(self, request):
        try:
            return Response(markets.groww_company(request.query_params.get('id', '')))
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            return Response({'error': str(exc) or 'Company profile unavailable'}, status=status.HTTP_502_BAD_GATEWAY)


class LiveIposView(ProxyView):
    def get(self, request):
        try:
            return Response(ipo.live_ipos())
        except Exception as exc:
            return Response({'error': str(exc) or 'Live IPO list unavailable'}, status=status.HTTP_502_BAD_GATEWAY)


class ListedIposView(ProxyView):
    def get(self, request):
        try:
            return Response(ipo.listed_ipos(request.query_params.get('year')))
        except Exception as exc:
            return Response({'error': str(exc) or 'Listed IPO archive unavailable'}, status=status.HTTP_502_BAD_GATEWAY)


class IpoDetailView(ProxyView):
    def get(self, request):
        slug = request.query_params.get('slug', '')
        year = request.query_params.get('year')
        try:
            return Response(ipo.ipo_detail(slug, year))
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except LookupError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_404_NOT_FOUND)
        except Exception as exc:
            return Response({'error': str(exc) or 'Could not load IPO analysis'}, status=status.HTTP_502_BAD_GATEWAY)


class IpoSubscriptionView(ProxyView):
    def get(self, request):
        try:
            return Response(ipo.ipo_subscription(request.query_params.get('id', '')))
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            return Response({'error': str(exc) or 'IPO subscription unavailable'}, status=status.HTTP_502_BAD_GATEWAY)
