"""Offline wrapper contracts; simulator output is not detector ground truth."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

from biasguard.simulation import load_simulator, main, proposed_crosswalk

HAS_MESA = importlib.util.find_spec("mesa") is not None


@unittest.skipUnless(HAS_MESA, "Mesa is an optional offline laboratory dependency")
class SimulationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.simulator = load_simulator()

    def test_all_138_entries_have_unapproved_crosswalk_records(self):
        result = proposed_crosswalk(self.simulator)
        self.assertEqual(result["simulation_entries"], 138)
        self.assertEqual(result["approved_mappings"], 0)
        for entry in result["entries"]:
            self.assertIsNone(entry["approved_detector_id"])
            self.assertFalse(entry["automatically_activated"])
            self.assertFalse(entry["empirically_validated"])

    def test_bundled_source_integrity_and_declared_scope(self):
        self.assertEqual(len(self.simulator.expected_ids()), 138)
        self.assertEqual(len(set(self.simulator.expected_ids())), 138)

    def test_population_factory_does_not_repeat_wrong_sized_group(self):
        plugin = self.simulator.load_plugin("pluralistic_ignorance")
        self.assertEqual(len(plugin.scenarios_for_population(12)[0]["contexts"][0]["private_positions"]), 12)

    def test_crosswalk_cli_only_writes_requested_offline_path(self):
        with tempfile.TemporaryDirectory() as folder:
            out = Path(folder) / "proposal.json"
            self.assertEqual(main(["crosswalk", "--output", str(out)]), 0)
            result = json.loads(out.read_text())
            self.assertEqual(result["approved_mappings"], 0)


if __name__ == "__main__":
    unittest.main()
