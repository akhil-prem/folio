from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("portfolio", "0005_holding_mutualfund_broker"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="holding",
            name="cap",
        ),
    ]
