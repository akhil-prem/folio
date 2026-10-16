import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("portfolio", "0002_member_access_login_image"),
    ]

    operations = [
        migrations.CreateModel(
            name="MutualFund",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=200)),
                ("amc", models.CharField(blank=True, max_length=120)),
                ("folio_number", models.CharField(blank=True, max_length=64)),
                (
                    "category",
                    models.CharField(
                        choices=[
                            ("Equity", "Equity"),
                            ("Hybrid", "Hybrid"),
                            ("Debt", "Debt"),
                            ("Index", "Index"),
                            ("Other", "Other"),
                        ],
                        default="Equity",
                        max_length=16,
                    ),
                ),
                ("color", models.CharField(default="#244d3c", max_length=16)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "member",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="mutual_funds",
                        to="portfolio.member",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="mutual_funds",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["name"],
            },
        ),
        migrations.CreateModel(
            name="SipEntry",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("year", models.PositiveIntegerField()),
                ("month", models.PositiveSmallIntegerField()),
                ("amount", models.DecimalField(decimal_places=2, max_digits=18)),
                ("note", models.CharField(blank=True, max_length=200)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "mutual_fund",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="sips",
                        to="portfolio.mutualfund",
                    ),
                ),
            ],
            options={
                "ordering": ["-year", "-month"],
            },
        ),
        migrations.AddConstraint(
            model_name="sipentry",
            constraint=models.UniqueConstraint(
                fields=("mutual_fund", "year", "month"),
                name="unique_sip_per_fund_month",
            ),
        ),
        migrations.AddConstraint(
            model_name="sipentry",
            constraint=models.CheckConstraint(
                condition=models.Q(("month__gte", 1), ("month__lte", 12)),
                name="sip_month_range",
            ),
        ),
        migrations.AddConstraint(
            model_name="sipentry",
            constraint=models.CheckConstraint(
                condition=models.Q(("amount__gt", 0)),
                name="sip_amount_positive",
            ),
        ),
    ]
