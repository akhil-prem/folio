from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework import serializers

from .models import Holding, Member, MutualFund, Profile, SipEntry

User = get_user_model()
MEMBER_COLORS = ["#244d3c", "#e8995d", "#7267d9", "#e0ba4c", "#d76868", "#3f85a6", "#77a87a"]


def portfolio_owner(user):
    member = getattr(user, "member_profile", None)
    if member is not None:
        return member.user
    return user


def actor_permissions(user):
    member = getattr(user, "member_profile", None)
    if member is None:
        return {
            "isAdmin": True,
            "canEdit": True,
            "canManageMembers": True,
            "access": Member.ACCESS_FULL,
            "memberId": None,
        }
    return {
        "isAdmin": False,
        "canEdit": member.access == Member.ACCESS_FULL,
        "canManageMembers": False,
        "access": member.access,
        "memberId": str(member.id),
    }


def member_image_url(member, request=None):
    if member is None or not member.image:
        return None
    from django.conf import settings

    path = member.image.url
    if not path.startswith("/"):
        path = f"/{path}"

    public_base = getattr(settings, "PUBLIC_BASE_URL", "") or ""
    if public_base:
        return f"{public_base}{path}"

    if request is not None:
        absolute = request.build_absolute_uri(path)
        # Prefer https when the app is served behind TLS (Render / custom subdomain).
        if absolute.startswith("http://") and request.META.get("HTTP_X_FORWARDED_PROTO") == "https":
            return "https://" + absolute[len("http://") :]
        return absolute
    return path


def account_member(user):
    linked = getattr(user, "member_profile", None)
    if linked is not None:
        return linked
    email = owner_member_email(user)
    if not email:
        return None
    return Member.objects.filter(user=user, email__iexact=email).first()


def serialize_account(user, request=None):
    profile, _ = Profile.objects.get_or_create(user=user, defaults={"role": "Administrator"})
    perms = actor_permissions(user)
    member = account_member(user)
    if member is not None:
        perms["memberId"] = str(member.id)
    return {
        "name": user.get_full_name() or user.username,
        "email": user.email,
        "phone": profile.phone,
        "role": profile.role,
        "image": member_image_url(member, request),
        **perms,
    }


def owner_member_email(owner):
    return (owner.email or owner.username or "").strip().lower()


def owner_member_name(owner):
    return (owner.get_full_name() or owner.username or "Owner").strip()


def is_owner_member(member):
    return member.email.lower() == owner_member_email(member.user)


def ensure_default_member(owner, preferred=None):
    """Keep the account owner as a member, and always as the default member."""
    name = owner_member_name(owner)
    email = owner_member_email(owner)
    if not email:
        return None

    # Prefer the existing default/owner member so profile name/email edits stay on the same person.
    self_member = (
        Member.objects.filter(user=owner, email__iexact=email).first()
        or Member.objects.filter(user=owner, is_default=True).first()
    )
    if self_member is None:
        used = Member.objects.filter(user=owner).count()
        self_member = Member.objects.create(
            user=owner,
            name=name,
            email=email,
            color=MEMBER_COLORS[used % len(MEMBER_COLORS)],
            is_default=True,
            can_login=False,
            access=Member.ACCESS_FULL,
        )
    else:
        updates = []
        if name and self_member.name != name:
            self_member.name = name
            updates.append("name")
        if self_member.email != email:
            self_member.email = email
            updates.append("email")
        if self_member.access != Member.ACCESS_FULL:
            self_member.access = Member.ACCESS_FULL
            updates.append("access")
        if not self_member.is_default:
            self_member.is_default = True
            updates.append("is_default")
        if updates:
            self_member.save(update_fields=updates)

    # Clear any other defaults only when needed.
    if Member.objects.filter(user=owner, is_default=True).exclude(pk=self_member.pk).exists():
        Member.objects.filter(user=owner, is_default=True).exclude(pk=self_member.pk).update(is_default=False)
    return self_member


def sync_member_login(member, *, can_login, password=None, email=None, name=None):
    email = (email or member.email or "").strip().lower()
    name = (name or member.name or "").strip()
    if not can_login:
        auth_user = member.auth_user
        if auth_user is not None:
            member.auth_user = None
            member.can_login = False
            member.save(update_fields=["auth_user", "can_login"])
            auth_user.delete()
        else:
            member.can_login = False
            member.save(update_fields=["can_login"])
        return member

    if not email:
        raise serializers.ValidationError({"email": "Email is required for login."})

    existing = User.objects.filter(email__iexact=email).first()
    if existing and existing.pk != getattr(member.auth_user, "pk", None):
        if existing.pk == member.user_id:
            raise serializers.ValidationError({"email": "Use a different email than the admin account for member login."})
        raise serializers.ValidationError({"email": "That email is already used for login."})

    auth_user = member.auth_user
    created = False
    if auth_user is None:
        if not password or len(password) < 8:
            raise serializers.ValidationError({"password": "Password must be at least 8 characters to enable login."})
        base_username = email
        username = base_username
        suffix = 1
        while User.objects.filter(username=username).exists():
            username = f"{base_username}+{suffix}"
            suffix += 1
        auth_user = User(username=username, email=email, first_name=name, is_staff=False, is_superuser=False)
        auth_user.set_password(password)
        auth_user.save()
        Profile.objects.get_or_create(user=auth_user, defaults={"role": "Member"})
        created = True
    else:
        auth_user.email = email
        auth_user.first_name = name
        if password:
            if len(password) < 8:
                raise serializers.ValidationError({"password": "Password must be at least 8 characters."})
            auth_user.set_password(password)
        auth_user.save()
        Profile.objects.get_or_create(user=auth_user, defaults={"role": "Member"})

    member.auth_user = auth_user
    member.can_login = True
    member.email = email
    if name:
        member.name = name
    member.save()
    if created and password is None:
        pass
    return member


class MemberSerializer(serializers.ModelSerializer):
    isDefault = serializers.BooleanField(source="is_default", required=False)
    canLogin = serializers.BooleanField(source="can_login", required=False)
    access = serializers.ChoiceField(choices=Member.ACCESS_CHOICES, required=False)
    isOwner = serializers.SerializerMethodField()
    image = serializers.SerializerMethodField()
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = Member
        fields = [
            "id",
            "name",
            "email",
            "color",
            "joined",
            "isDefault",
            "canLogin",
            "access",
            "isOwner",
            "image",
            "password",
        ]
        read_only_fields = ["id", "color", "joined", "image", "isOwner"]

    def get_image(self, obj):
        return member_image_url(obj, self.context.get("request"))

    def get_isOwner(self, obj):
        return is_owner_member(obj)

    def validate_access(self, value):
        if value not in {Member.ACCESS_FULL, Member.ACCESS_READONLY}:
            raise serializers.ValidationError("Access must be full or readonly.")
        return value

    def validate_email(self, value):
        return value.strip().lower()

    def validate(self, attrs):
        request = self.context["request"]
        owner = portfolio_owner(request.user)
        owner_email = owner_member_email(owner)
        email = attrs.get("email")
        if email is None and self.instance is not None:
            email = self.instance.email
        email = (email or "").strip().lower()

        if self.instance is None and email == owner_email:
            raise serializers.ValidationError({"email": "That email belongs to the account owner member."})

        if self.instance is not None and is_owner_member(self.instance):
            if "email" in attrs and attrs["email"] != owner_email:
                raise serializers.ValidationError({"email": "The account owner member email cannot be changed here."})
            if attrs.get("can_login") is True:
                raise serializers.ValidationError({"canLogin": "The account owner already signs in with the admin login."})
            attrs["access"] = Member.ACCESS_FULL
            attrs["is_default"] = True
            attrs["can_login"] = False
        elif email == owner_email:
            raise serializers.ValidationError({"email": "That email belongs to the account owner member."})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        request = self.context["request"]
        owner = portfolio_owner(request.user)
        ensure_default_member(owner)
        password = validated_data.pop("password", "") or ""
        can_login = validated_data.pop("can_login", False)
        validated_data.pop("is_default", None)
        used = Member.objects.filter(user=owner).count()
        member = Member.objects.create(
            user=owner,
            color=MEMBER_COLORS[used % len(MEMBER_COLORS)],
            is_default=False,
            can_login=False,
            **validated_data,
        )
        ensure_default_member(owner)
        if can_login:
            sync_member_login(member, can_login=True, password=password, email=member.email, name=member.name)
        else:
            member.can_login = False
            member.save(update_fields=["can_login"])
        return member

    @transaction.atomic
    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        can_login = validated_data.pop("can_login", serializers.empty)
        validated_data.pop("is_default", None)

        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        ensure_default_member(instance.user)

        if is_owner_member(instance):
            return instance

        if can_login is serializers.empty:
            if password:
                sync_member_login(
                    instance,
                    can_login=True,
                    password=password,
                    email=instance.email,
                    name=instance.name,
                )
        else:
            sync_member_login(
                instance,
                can_login=bool(can_login),
                password=password or None,
                email=instance.email,
                name=instance.name,
            )
        return instance


class HoldingSerializer(serializers.ModelSerializer):
    memberId = serializers.UUIDField(source="member_id", required=False)
    subSector = serializers.CharField(source="sub_sector", allow_blank=True, required=False, default="")
    avgPrice = serializers.FloatField(source="avg_price", required=False)
    quantity = serializers.FloatField(required=False)

    class Meta:
        model = Holding
        fields = ["id", "memberId", "symbol", "company", "sector", "subSector", "cap", "broker", "quantity", "avgPrice"]
        read_only_fields = ["id"]

    def validate_memberId(self, value):
        request = self.context["request"]
        owner = portfolio_owner(request.user)
        if not Member.objects.filter(id=value, user=owner).exists():
            raise serializers.ValidationError("Member not found.")
        return value

    def validate_cap(self, value):
        if value not in {"Large", "Mid", "Small"}:
            raise serializers.ValidationError("Market cap must be Large, Mid, or Small.")
        return value

    def validate_broker(self, value):
        from .models import BROKER_CHOICES

        allowed = {choice[0] for choice in BROKER_CHOICES}
        if value not in allowed:
            raise serializers.ValidationError("Invalid broker.")
        return value

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError("Quantity must be greater than zero.")
        return value

    def validate_avgPrice(self, value):
        if value <= 0:
            raise serializers.ValidationError("Average price must be greater than zero.")
        return value

    def validate(self, attrs):
        if not self.instance and not attrs.get("member_id"):
            raise serializers.ValidationError({"memberId": "This field is required."})
        if not self.instance:
            if attrs.get("quantity") is None:
                raise serializers.ValidationError({"quantity": "This field is required."})
            if attrs.get("avg_price") is None:
                raise serializers.ValidationError({"avgPrice": "This field is required."})
        return attrs


class SipEntrySerializer(serializers.ModelSerializer):
    mutualFundId = serializers.UUIDField(source="mutual_fund_id")
    amount = serializers.FloatField()

    class Meta:
        model = SipEntry
        fields = ["id", "mutualFundId", "year", "month", "amount", "note"]
        read_only_fields = ["id"]

    def validate_mutualFundId(self, value):
        owner = portfolio_owner(self.context["request"].user)
        if not MutualFund.objects.filter(id=value, user=owner).exists():
            raise serializers.ValidationError("Mutual fund not found.")
        return value

    def validate_month(self, value):
        if value < 1 or value > 12:
            raise serializers.ValidationError("Month must be between 1 and 12.")
        return value

    def validate_year(self, value):
        if value < 1990 or value > 2100:
            raise serializers.ValidationError("Enter a valid year.")
        return value

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Amount must be greater than zero.")
        return value

    def validate(self, attrs):
        fund_id = attrs.get("mutual_fund_id") or getattr(self.instance, "mutual_fund_id", None)
        year = attrs.get("year", getattr(self.instance, "year", None))
        month = attrs.get("month", getattr(self.instance, "month", None))
        if fund_id and year and month:
            clash = SipEntry.objects.filter(mutual_fund_id=fund_id, year=year, month=month)
            if self.instance is not None:
                clash = clash.exclude(pk=self.instance.pk)
            if clash.exists():
                raise serializers.ValidationError({"month": "A SIP entry already exists for this month."})
        return attrs


class MutualFundSerializer(serializers.ModelSerializer):
    memberId = serializers.UUIDField(source="member_id")
    folioNumber = serializers.CharField(source="folio_number", allow_blank=True, required=False, default="")
    schemeCode = serializers.CharField(source="scheme_code", allow_blank=True, required=False, default="")
    searchId = serializers.CharField(source="search_id", allow_blank=True, required=False, default="")
    totalInvested = serializers.SerializerMethodField()
    sipCount = serializers.SerializerMethodField()
    sips = SipEntrySerializer(many=True, read_only=True)
    color = serializers.CharField(read_only=True)

    class Meta:
        model = MutualFund
        fields = [
            "id",
            "memberId",
            "name",
            "amc",
            "folioNumber",
            "category",
            "broker",
            "schemeCode",
            "searchId",
            "color",
            "totalInvested",
            "sipCount",
            "sips",
        ]
        read_only_fields = ["id", "color", "totalInvested", "sipCount", "sips"]

    def get_totalInvested(self, obj):
        if hasattr(obj, "invested_total") and obj.invested_total is not None:
            return float(obj.invested_total)
        return float(sum((sip.amount for sip in obj.sips.all()), 0))

    def get_sipCount(self, obj):
        if hasattr(obj, "sip_total_count") and obj.sip_total_count is not None:
            return int(obj.sip_total_count)
        return obj.sips.count()

    def validate_memberId(self, value):
        owner = portfolio_owner(self.context["request"].user)
        if not Member.objects.filter(id=value, user=owner).exists():
            raise serializers.ValidationError("Member not found.")
        return value

    def validate_category(self, value):
        allowed = {choice[0] for choice in MutualFund.CATEGORY_CHOICES}
        if value not in allowed:
            raise serializers.ValidationError("Invalid category.")
        return value

    def validate_broker(self, value):
        from .models import BROKER_CHOICES

        allowed = {choice[0] for choice in BROKER_CHOICES}
        if value not in allowed:
            raise serializers.ValidationError("Invalid broker.")
        return value

    def create(self, validated_data):
        owner = portfolio_owner(self.context["request"].user)
        used = MutualFund.objects.filter(user=owner).count()
        validated_data["user"] = owner
        validated_data["color"] = MEMBER_COLORS[used % len(MEMBER_COLORS)]
        return super().create(validated_data)
