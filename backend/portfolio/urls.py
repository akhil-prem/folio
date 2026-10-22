from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter(trailing_slash=True)
router.register(r"members", views.MemberViewSet, basename="member")
router.register(r"holdings", views.HoldingViewSet, basename="holding")
router.register(r"mutual-funds", views.MutualFundViewSet, basename="mutual-fund")
router.register(r"sip-entries", views.SipEntryViewSet, basename="sip-entry")

urlpatterns = [
    path("auth/login/", views.LoginView.as_view()),
    path("auth/logout/", views.LogoutView.as_view()),
    path("auth/me/", views.MeView.as_view()),
    path("auth/password/", views.PasswordView.as_view()),
    path("market-overview", views.MarketOverviewView.as_view()),
    path("nse-movers", views.NseMoversView.as_view()),
    path("nse-equities", views.NseEquitiesView.as_view()),
    path("stock-search", views.StockSearchView.as_view()),
    path("stock-suggest", views.StockSuggestView.as_view()),
    path("groww-search", views.GrowwSearchView.as_view()),
    path("groww-company", views.GrowwCompanyView.as_view()),
    path("mf-search", views.MfSearchView.as_view()),
    path("mf-scheme", views.MfSchemeView.as_view()),
    path("mf-nav", views.MfNavView.as_view()),
    path("stocks/<str:symbol>", views.StockQuoteView.as_view()),
    path("stock-detail", views.StockDetailView.as_view()),
    path("stock-history", views.StockHistoryView.as_view()),
    path("ipos", views.IpoListView.as_view()),
    path("ipos-listed", views.IpoListedView.as_view()),
    path("ipo-detail", views.IpoDetailView.as_view()),
    path("ipo-subscription", views.IpoSubscriptionView.as_view()),
    path("", include(router.urls)),
]
