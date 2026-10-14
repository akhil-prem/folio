from django.urls import include, path
from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter(trailing_slash=True)
router.register(r'members', views.MemberViewSet, basename='member')
router.register(r'holdings', views.HoldingViewSet, basename='holding')

urlpatterns = [
    path('auth/login/', views.LoginView.as_view()),
    path('auth/logout/', views.LogoutView.as_view()),
    path('auth/me/', views.MeView.as_view()),
    path('auth/password/', views.PasswordView.as_view()),
    path('market-overview', views.MarketOverviewView.as_view()),
    path('nse-movers', views.NseMoversView.as_view()),
    path('nse-equities', views.NseEquitiesView.as_view()),
    path('stock-search', views.StockSearchView.as_view()),
    path('groww-search', views.GrowwSearchView.as_view()),
    path('groww-company', views.GrowwCompanyView.as_view()),
    path('stocks/<str:symbol>', views.StockQuoteView.as_view()),
    path('ipos', views.LiveIposView.as_view()),
    path('ipos-listed', views.ListedIposView.as_view()),
    path('ipo-detail', views.IpoDetailView.as_view()),
    path('ipo-subscription', views.IpoSubscriptionView.as_view()),
    path('', include(router.urls)),
]
