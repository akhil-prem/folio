from django.core.management.base import BaseCommand

from portfolio.signals import ensure_bootstrap_user


class Command(BaseCommand):
    help = "Create the initial Folio admin account if it does not exist."

    def handle(self, *args, **options):
        user = ensure_bootstrap_user()
        self.stdout.write(self.style.SUCCESS(f"Bootstrap account ready: {user.email}"))
