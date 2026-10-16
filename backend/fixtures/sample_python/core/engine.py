# Sample Python fixture - Core Engine
from auth.jwt import create_access_token
from auth.user import UserManager

class CoreEngine:
    def __init__(self):
        self.manager = UserManager()

    def process_transaction(self, tx_type: str, amount: float, flags: dict) -> dict:
        """High cyclomatic complexity function with multiple branches."""
        status = "pending"
        fee = 0.0

        if tx_type == "deposit":
            if amount > 1000:
                fee = amount * 0.01
            elif amount > 500:
                fee = 5.0
            else:
                fee = 1.0
            status = "approved"
        elif tx_type == "withdrawal":
            if amount > 5000:
                status = "fraud_review"
            elif amount > 2000 and flags.get("suspicious"):
                status = "blocked"
            else:
                status = "completed"
        elif tx_type == "transfer":
            if flags.get("international"):
                fee = 15.0
                if amount > 10000:
                    status = "compliance_check"
                else:
                    status = "pending_clearing"
            else:
                fee = 2.0
                status = "completed"
        else:
            status = "rejected"

        return {"status": status, "fee": fee}
