import unittest

from backend.database import CHECKLIST_SCHEMA_STATEMENTS, adapt_query


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

class ChecklistSchemaTests(unittest.TestCase):
    def test_defines_checklist_tables_and_cascades(self):
        schema = "\n".join(CHECKLIST_SCHEMA_STATEMENTS)
        self.assertIn("CREATE TABLE IF NOT EXISTS checklist_members", schema)
        self.assertIn("CREATE TABLE IF NOT EXISTS checklist_items", schema)
        self.assertIn("CREATE TABLE IF NOT EXISTS checklist_item_members", schema)
        self.assertGreaterEqual(schema.count("ON DELETE CASCADE"), 4)

    def test_defines_trip_indexes(self):
        schema = "\n".join(CHECKLIST_SCHEMA_STATEMENTS)
        self.assertIn("checklist_members_trip_idx", schema)
        self.assertIn("checklist_items_trip_idx", schema)


if __name__ == "__main__":
    unittest.main()
