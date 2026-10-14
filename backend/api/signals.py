from django.contrib.auth import get_user_model
from django.db.models.signals import post_migrate
from django.dispatch import receiver

DEFAULT_EMAIL = 'admin@folio.app'
DEFAULT_PASSWORD = 'folio123'


@receiver(post_migrate)
def ensure_default_user(sender, **kwargs):
    if sender.name != 'api':
        return
    User = get_user_model()
    if User.objects.filter(email=DEFAULT_EMAIL).exists():
        return
    User.objects.create_user(
        email=DEFAULT_EMAIL,
        password=DEFAULT_PASSWORD,
        name='Folio Admin',
        role='Portfolio owner',
    )
