import os
from app import app

if __name__ == "__main__":
    app.run(
        debug=os.getenv("FLASK_ENV") == "development",
        host="0.0.0.0",
        port=int(os.getenv("PORT", 5000)),
    )
