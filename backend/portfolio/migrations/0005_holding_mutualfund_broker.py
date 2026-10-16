from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("portfolio", "0004_mutualfund_scheme_lookup"),
    ]

    operations = [
        migrations.AddField(
            model_name="holding",
            name="broker",
            field=models.CharField(
                choices=[
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
                ],
                default="Groww",
                max_length=32,
            ),
        ),
        migrations.AddField(
            model_name="mutualfund",
            name="broker",
            field=models.CharField(
                choices=[
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
                ],
                default="Groww",
                max_length=32,
            ),
        ),
    ]
