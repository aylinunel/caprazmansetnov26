"""Review drafts must be refused before pipeline scoring or public data writes."""
import json
from pathlib import Path
import tempfile
import unittest

from capraz_pipeline.build import build, load_public_biasguard


class BiasGuardPublicationTests(unittest.TestCase):
    def test_legacy_review_loads_without_detector_or_mesa_dependency(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "biasguard.json"
            payload = {"summary": {"completed": 0}, "events": []}
            path.write_text(json.dumps(payload))
            self.assertEqual(load_public_biasguard(path), payload)

    def test_draft_refused_before_any_pipeline_or_public_write(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            out = root / "out"
            out.mkdir()
            payload = {"metadata": {"algorithm": "news-validity-v1", "publication_status": "draft"}, "events": []}
            path = out / "biasguard.json"
            original = json.dumps(payload)
            path.write_text(original)
            with self.assertRaisesRegex(ValueError, "draft"):
                build(root / "missing-store", root / "missing-reference", out)
            self.assertEqual(path.read_text(), original)
            self.assertEqual(sorted(p.name for p in out.iterdir()), ["biasguard.json"])
            self.assertFalse((root / "missing-store").exists())

    def test_stripping_payload_metadata_does_not_remove_event_guard(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "biasguard.json"
            path.write_text(json.dumps({"events": [{"event": "e", "validity_gate": {"review_required": True}}]}))
            with self.assertRaises(ValueError):
                load_public_biasguard(path)

    def test_native_guarded_root_refused_before_pipeline_execution(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            out = root / "out"
            out.mkdir()
            (out / "biasguard.json").write_text(json.dumps({"status": "review_complete", "validity_gate": {}}))
            with self.assertRaises(ValueError):
                build(root / "missing-store", root / "missing-reference", out)
            self.assertFalse((out / "core.bin").exists())


if __name__ == "__main__":
    unittest.main()
