from app.migration_runner import run_migrations_and_seeds

if __name__ == "__main__":
    print("Running migrations and seeds...")
    run_migrations_and_seeds()
    print("Done.")
