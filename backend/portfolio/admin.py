from django.contrib import admin

from .models import Holding, Member, MutualFund, Profile, SipEntry


@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "phone", "role")


@admin.register(Member)
class MemberAdmin(admin.ModelAdmin):
    list_display = ("name", "email", "user", "is_default", "can_login", "access", "joined")
    list_filter = ("is_default", "can_login", "access")
    search_fields = ("name", "email")


@admin.register(Holding)
class HoldingAdmin(admin.ModelAdmin):
    list_display = ("symbol", "company", "member", "broker", "quantity", "avg_price")
    list_filter = ("broker",)


class SipEntryInline(admin.TabularInline):
    model = SipEntry
    extra = 0


@admin.register(MutualFund)
class MutualFundAdmin(admin.ModelAdmin):
    list_display = ("name", "member", "broker", "category", "amc", "folio_number")
    list_filter = ("broker", "category")
    search_fields = ("name", "amc", "folio_number", "scheme_code", "search_id")
    inlines = [SipEntryInline]


@admin.register(SipEntry)
class SipEntryAdmin(admin.ModelAdmin):
    list_display = ("mutual_fund", "year", "month", "amount")
    list_filter = ("year", "month")
