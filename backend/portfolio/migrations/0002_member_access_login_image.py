import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def mark_default_members(apps, schema_editor):
    Member = apps.get_model("portfolio", "Member")
    owners = Member.objects.values_list("user_id", flat=True).distinct()
    for owner_id in owners:
        members = list(Member.objects.filter(user_id=owner_id).order_by("joined", "name"))
        if not members:
            continue
        if not any(member.is_default for member in members):
            first = members[0]
            first.is_default = True
            first.save(update_fields=["is_default"])


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("portfolio", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="member",
            name="access",
            field=models.CharField(
                choices=[("full", "Full access"), ("readonly", "Read only")],
                default="readonly",
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name="member",
            name="auth_user",
            field=models.OneToOneField(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="member_profile",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="member",
            name="can_login",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="member",
            name="image",
            field=models.ImageField(blank=True, null=True, upload_to="members/"),
        ),
        migrations.AddField(
            model_name="member",
            name="is_default",
            field=models.BooleanField(default=False),
        ),
        migrations.AlterModelOptions(
            name="member",
            options={"ordering": ["-is_default", "joined", "name"]},
        ),
        migrations.RunPython(mark_default_members, migrations.RunPython.noop),
    ]
