import unittest

from backend.database import adapt_query


class QueryAdapterTests(unittest.TestCase):
    def test_adapts_positional_parameters(self):
        query = "SELECT * FROM nodes WHERE trip_slug = ? AND id = ?"
        self.assertEqual(
            adapt_query(query),
            "SELECT * FROM nodes WHERE trip_slug = %s AND id = %s",
        )

    def test_adapts_named_parameters(self):
        query = "INSERT INTO edges (id, source) VALUES (:id, :source)"
        self.assertEqual(
            adapt_query(query),
            "INSERT INTO edges (id, source) VALUES (%(id)s, %(source)s)",
        )

    def test_keeps_postgresql_casts(self):
        self.assertEqual(adapt_query("SELECT '[]'::jsonb"), "SELECT '[]'::jsonb")


if __name__ == "__main__":
    unittest.main()
