from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("portfolio", "0003_mutualfund_sipentry"),
    ]

    operations = [
        migrations.AddField(
            model_name="mutualfund",
            name="scheme_code",
            field=models.CharField(blank=True, max_length=32),
        ),
        migrations.AddField(
            model_name="mutualfund",
            name="search_id",
            field=models.CharField(blank=True, max_length=200),
        ),
    ]
