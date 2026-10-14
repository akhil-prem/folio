from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.forms import UserChangeForm, UserCreationForm

from .models import Holding, Member, User


class FolioUserCreationForm(UserCreationForm):
    class Meta(UserCreationForm.Meta):
        model = User
        fields = ('email', 'name')


class FolioUserChangeForm(UserChangeForm):
    class Meta(UserChangeForm.Meta):
        model = User
        fields = '__all__'


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    form = FolioUserChangeForm
    add_form = FolioUserCreationForm
    ordering = ['email']
    list_display = ['email', 'name', 'role', 'is_staff']
    search_fields = ['email', 'name']
    list_filter = ['is_staff', 'is_superuser', 'is_active']
    filter_horizontal = ['groups', 'user_permissions']
    fieldsets = (
        (None, {'fields': ('email', 'password')}),
        ('Profile', {'fields': ('name', 'phone', 'role')}),
        ('Permissions', {'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
    )
    add_fieldsets = (
        (None, {'classes': ('wide',), 'fields': ('email', 'name', 'password1', 'password2')}),
    )


@admin.register(Member)
class MemberAdmin(admin.ModelAdmin):
    list_display = ['name', 'email', 'owner', 'joined']
    search_fields = ['name', 'email']


@admin.register(Holding)
class HoldingAdmin(admin.ModelAdmin):
    list_display = ['symbol', 'company', 'member', 'quantity', 'avg_price']
    search_fields = ['symbol', 'company']
