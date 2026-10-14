from rest_framework import serializers

from .models import Holding, Member, Profile

MEMBER_COLORS = ["#244d3c", "#e8995d", "#7267d9", "#e0ba4c", "#d76868", "#3f85a6", "#77a87a"]


def serialize_account(user):
    profile, _ = Profile.objects.get_or_create(user=user, defaults={"role": "Administrator"})
    return {
        "name": user.get_full_name() or user.username,
        "email": user.email,
        "phone": profile.phone,
        "role": profile.role,
    }


class MemberSerializer(serializers.ModelSerializer):
    class Meta:
        model = Member
        fields = ["id", "name", "email", "color", "joined"]
        read_only_fields = ["id", "color", "joined"]


class HoldingSerializer(serializers.ModelSerializer):
    memberId = serializers.UUIDField(source="member_id", required=False)
    subSector = serializers.CharField(source="sub_sector", allow_blank=True, required=False, default="")
    avgPrice = serializers.FloatField(source="avg_price", required=False)
    quantity = serializers.FloatField(required=False)

    class Meta:
        model = Holding
        fields = ["id", "memberId", "symbol", "company", "sector", "subSector", "cap", "quantity", "avgPrice"]
        read_only_fields = ["id"]

    def validate_memberId(self, value):
        request = self.context["request"]
        if not Member.objects.filter(id=value, user=request.user).exists():
            raise serializers.ValidationError("Member not found.")
        return value

    def validate_cap(self, value):
        if value not in {"Large", "Mid", "Small"}:
            raise serializers.ValidationError("Market cap must be Large, Mid, or Small.")
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
