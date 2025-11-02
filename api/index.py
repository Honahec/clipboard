import sys
import os

# Add the backend directory to the Python path
backend_path = os.path.join(os.path.dirname(__file__), '..', 'backend')
sys.path.insert(0, backend_path)

# Import the FastAPI app
from app.main import app  # noqa: E402

# Export the app for Vercel
# Vercel will use this as the ASGI application
handler = app
