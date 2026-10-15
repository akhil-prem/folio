from django.conf import settings
from django.contrib.auth import get_user_model
from django.db.models.signals import post_migrate
from django.dispatch import receiver
from rest_framework.authtoken.models import Token

from .models import Profile


def ensure_bootstrap_user():
    email = settings.BOOTSTRAP_EMAIL
    password = settings.BOOTSTRAP_PASSWORD
    name = settings.BOOTSTRAP_NAME
    User = get_user_model()
    user, created = User.objects.get_or_create(
        username=email,
        defaults={"email": email, "first_name": name, "is_staff": True, "is_superuser": True},
    )
    if created:
        user.set_password(password)
        user.save()
    else:
        if not user.email:
            user.email = email
            user.save(update_fields=["email"])
        if not user.check_password(password) and created:
            user.set_password(password)
            user.save()
    Profile.objects.get_or_create(user=user, defaults={"role": "Administrator"})
    Token.objects.get_or_create(user=user)
    return user


@receiver(post_migrate)
def create_bootstrap_user(sender, **kwargs):
    if sender.name != "portfolio":
        return
    ensure_bootstrap_user()
