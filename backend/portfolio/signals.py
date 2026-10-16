from django.conf import settings
from django.contrib.auth import get_user_model
from django.db.models.signals import post_migrate
from django.dispatch import receiver
from rest_framework.authtoken.models import Token

from .models import Profile
from .serializers import ensure_default_member


def ensure_bootstrap_user():
    """Create a bootstrap admin only when the database has no staff users yet."""
    User = get_user_model()
    existing_admin = User.objects.filter(is_staff=True).order_by("id").first()
    if existing_admin is not None:
        Profile.objects.get_or_create(user=existing_admin, defaults={"role": "Administrator"})
        ensure_default_member(existing_admin)
        return existing_admin

    email = settings.BOOTSTRAP_EMAIL
    password = settings.BOOTSTRAP_PASSWORD
    name = settings.BOOTSTRAP_NAME
    user = User.objects.create_user(
        username=email,
        email=email,
        first_name=name,
        password=password,
    )
    user.is_staff = True
    user.is_superuser = True
    user.save(update_fields=["is_staff", "is_superuser"])
    Profile.objects.get_or_create(user=user, defaults={"role": "Administrator"})
    Token.objects.get_or_create(user=user)
    ensure_default_member(user)
    return user


@receiver(post_migrate)
def create_bootstrap_user(sender, **kwargs):
    if sender.name != "portfolio":
        return
    ensure_bootstrap_user()
