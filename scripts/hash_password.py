import getpass
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

password = getpass.getpass("Enter admin password to hash: ")
hashed = pwd_context.hash(password)
print(f"\nADMIN_PASSWORD_HASH={hashed}")
print("\nPaste the line above into your backend/.env file.")
