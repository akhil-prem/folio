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
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="members")
    name = models.CharField(max_length=120)
    email = models.EmailField()
    color = models.CharField(max_length=16, default="#244d3c")
    joined = models.DateField(auto_now_add=True)

    class Meta:
        ordering = ["joined", "name"]

    def __str__(self):
        return self.name


class Holding(models.Model):
    CAP_CHOICES = (
        ("Large", "Large"),
        ("Mid", "Mid"),
        ("Small", "Small"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="holdings")
    member = models.ForeignKey(Member, on_delete=models.CASCADE, related_name="holdings")
    symbol = models.CharField(max_length=32)
    company = models.CharField(max_length=200)
    sector = models.CharField(max_length=80, blank=True)
    sub_sector = models.CharField(max_length=80, blank=True)
    cap = models.CharField(max_length=8, choices=CAP_CHOICES, default="Large")
    quantity = models.DecimalField(max_digits=18, decimal_places=4)
    avg_price = models.DecimalField(max_digits=18, decimal_places=4)

    class Meta:
        ordering = ["symbol"]

    def __str__(self):
        return f"{self.symbol} ({self.member.name})"
