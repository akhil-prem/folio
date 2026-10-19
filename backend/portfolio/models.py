import uuid

from django.conf import settings
from django.db import models


class Profile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile")
    phone = models.CharField(max_length=32, blank=True)
    role = models.CharField(max_length=64, default="Administrator")

    def __str__(self):
        return self.user.email or self.user.username


class Member(models.Model):
    ACCESS_FULL = "full"
    ACCESS_READONLY = "readonly"
    ACCESS_CHOICES = (
        (ACCESS_FULL, "Full access"),
        (ACCESS_READONLY, "Read only"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="members")
    auth_user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="member_profile",
    )
    name = models.CharField(max_length=120)
    email = models.EmailField()
    color = models.CharField(max_length=16, default="#244d3c")
    joined = models.DateField(auto_now_add=True)
    is_default = models.BooleanField(default=False)
    can_login = models.BooleanField(default=False)
    access = models.CharField(max_length=16, choices=ACCESS_CHOICES, default=ACCESS_READONLY)
    image = models.ImageField(upload_to="members/", blank=True, null=True)

    class Meta:
        ordering = ["-is_default", "joined", "name"]

    def __str__(self):
        return self.name


BROKER_CHOICES = (
    ("Groww", "Groww"),
    ("Zerodha", "Zerodha"),
    ("Upstox", "Upstox"),
    ("Angel One", "Angel One"),
    ("ICICI Direct", "ICICI Direct"),
    ("HDFC Securities", "HDFC Securities"),
    ("Kotak Securities", "Kotak Securities"),
    ("Motilal Oswal", "Motilal Oswal"),
    ("Paytm Money", "Paytm Money"),
    ("5paisa", "5paisa"),
    ("Other", "Other"),
)


class Holding(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="holdings")
    member = models.ForeignKey(Member, on_delete=models.CASCADE, related_name="holdings")
    symbol = models.CharField(max_length=32)
    company = models.CharField(max_length=200)
    sector = models.CharField(max_length=80, blank=True)
    sub_sector = models.CharField(max_length=80, blank=True)
    broker = models.CharField(max_length=32, choices=BROKER_CHOICES, default="Groww")
    quantity = models.DecimalField(max_digits=18, decimal_places=4)
    avg_price = models.DecimalField(max_digits=18, decimal_places=4)

    class Meta:
        ordering = ["symbol"]

    def __str__(self):
        return f"{self.symbol} ({self.member.name})"


class MutualFund(models.Model):
    CATEGORY_CHOICES = (
        ("Equity", "Equity"),
        ("Hybrid", "Hybrid"),
        ("Debt", "Debt"),
        ("Index", "Index"),
        ("Other", "Other"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="mutual_funds")
    member = models.ForeignKey(Member, on_delete=models.CASCADE, related_name="mutual_funds")
    name = models.CharField(max_length=200)
    amc = models.CharField(max_length=120, blank=True)
    folio_number = models.CharField(max_length=64, blank=True)
    category = models.CharField(max_length=16, choices=CATEGORY_CHOICES, default="Equity")
    broker = models.CharField(max_length=32, choices=BROKER_CHOICES, default="Groww")
    scheme_code = models.CharField(max_length=32, blank=True)
    search_id = models.CharField(max_length=200, blank=True)
    color = models.CharField(max_length=16, default="#244d3c")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.member.name})"


class SipEntry(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    mutual_fund = models.ForeignKey(MutualFund, on_delete=models.CASCADE, related_name="sips")
    year = models.PositiveIntegerField()
    month = models.PositiveSmallIntegerField()
    amount = models.DecimalField(max_digits=18, decimal_places=2)
    note = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-year", "-month"]
        constraints = [
            models.UniqueConstraint(fields=["mutual_fund", "year", "month"], name="unique_sip_per_fund_month"),
            models.CheckConstraint(condition=models.Q(month__gte=1, month__lte=12), name="sip_month_range"),
            models.CheckConstraint(condition=models.Q(amount__gt=0), name="sip_amount_positive"),
        ]

    def __str__(self):
        return f"{self.mutual_fund.name} {self.year}-{self.month:02d}: {self.amount}"
