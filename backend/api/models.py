import uuid

from django.conf import settings
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models

MEMBER_COLORS = ['#244d3c', '#e8995d', '#7267d9', '#e0ba4c', '#d76868', '#3f85a6', '#77a87a']


class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('Email is required')
        extra_fields.setdefault('is_active', True)
        user = self.model(email=self.normalize_email(email), **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('role', 'Administrator')
        extra_fields.setdefault('name', extra_fields.get('name') or 'Folio Admin')
        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    name = models.CharField(max_length=150)
    phone = models.CharField(max_length=32, blank=True)
    role = models.CharField(max_length=80, default='Portfolio owner')
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(auto_now_add=True)

    objects = UserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['name']

    def __str__(self):
        return self.email


class Member(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='members', on_delete=models.CASCADE)
    name = models.CharField(max_length=150)
    email = models.EmailField()
    color = models.CharField(max_length=16)
    joined = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['joined']

    def __str__(self):
        return self.name


class Holding(models.Model):
    CAP_CHOICES = (('Large', 'Large'), ('Mid', 'Mid'), ('Small', 'Small'))

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='holdings', on_delete=models.CASCADE)
    member = models.ForeignKey(Member, related_name='holdings', on_delete=models.CASCADE)
    symbol = models.CharField(max_length=32)
    company = models.CharField(max_length=200)
    sector = models.CharField(max_length=80, blank=True)
    sub_sector = models.CharField(max_length=80, blank=True)
    cap = models.CharField(max_length=8, choices=CAP_CHOICES, default='Large')
    quantity = models.DecimalField(max_digits=16, decimal_places=4)
    avg_price = models.DecimalField(max_digits=16, decimal_places=4)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.symbol} ({self.member.name})'
