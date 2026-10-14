from rest_framework import serializers

from .models import MEMBER_COLORS, Holding, Member, User


class AccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['name', 'email', 'phone', 'role']
        extra_kwargs = {
            'role': {'read_only': True},
        }

    def validate_email(self, value):
        user = self.instance
        if User.objects.exclude(pk=user.pk).filter(email__iexact=value).exists():
            raise serializers.ValidationError('That email is already in use.')
        return value.lower()


class MemberSerializer(serializers.ModelSerializer):
    joined = serializers.DateTimeField(format='%Y-%m-%d', read_only=True)
    color = serializers.CharField(read_only=True)

    class Meta:
        model = Member
        fields = ['id', 'name', 'email', 'color', 'joined']

    def create(self, validated_data):
        owner = self.context['request'].user
        count = owner.members.count()
        validated_data['owner'] = owner
        validated_data['color'] = MEMBER_COLORS[count % len(MEMBER_COLORS)]
        return super().create(validated_data)


class HoldingSerializer(serializers.ModelSerializer):
    memberId = serializers.UUIDField(source='member_id')
    subSector = serializers.CharField(source='sub_sector', allow_blank=True, required=False, default='')
    avgPrice = serializers.FloatField(source='avg_price')
    quantity = serializers.FloatField()

    class Meta:
        model = Holding
        fields = ['id', 'memberId', 'symbol', 'company', 'sector', 'subSector', 'cap', 'quantity', 'avgPrice']

    def validate_memberId(self, value):
        owner = self.context['request'].user
        if not Member.objects.filter(pk=value, owner=owner).exists():
            raise serializers.ValidationError('Member not found.')
        return value

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError('Quantity must be greater than 0.')
        return value

    def validate_avgPrice(self, value):
        if value <= 0:
            raise serializers.ValidationError('Average price must be greater than 0.')
        return value

    def create(self, validated_data):
        validated_data['owner'] = self.context['request'].user
        validated_data['symbol'] = str(validated_data.get('symbol', '')).upper()
        return super().create(validated_data)

    def update(self, instance, validated_data):
        if 'symbol' in validated_data:
            validated_data['symbol'] = str(validated_data['symbol']).upper()
        return super().update(instance, validated_data)
