import os
from typing import Dict, List

import faiss
import numpy as np
from sentence_transformers import SentenceTransformer


class SimpleRAG:
    def __init__(self, model_name: str = "all-MiniLM-L6-v2") -> None:
        self.model = SentenceTransformer(model_name, device="cpu")
        self.chunks: List[str] = []
        self.metadata: List[Dict[str, str]] = []
        self.index: faiss.IndexFlatIP | None = None

    def load_documents(self, folder: str = "reference_docs") -> None:
        self.chunks = []
        self.metadata = []

        if not os.path.isdir(folder):
            raise FileNotFoundError(f"Folder not found: {folder}")

        for filename in sorted(os.listdir(folder)):
            if not filename.endswith(".txt"):
                continue

            file_path = os.path.join(folder, filename)
            with open(file_path, "r", encoding="utf-8") as file:
                text = file.read()

            for line in text.split("\n"):
                chunk = line.strip()
                if not chunk:
                    continue
                self.chunks.append(chunk)
                self.metadata.append({"source": filename})

    def build_index(self) -> None:
        if not self.chunks:
            self.index = None
            return

        embeddings = self.model.encode(
            self.chunks,
            convert_to_numpy=True,
            normalize_embeddings=True,
            show_progress_bar=False,
        ).astype("float32")

        dimension = embeddings.shape[1]
        self.index = faiss.IndexFlatIP(dimension)
        self.index.add(embeddings)

    def retrieve(self, query: str, k: int = 3, threshold: float = 0.35) -> List[Dict[str, str | float]]:
        if self.index is None or not self.chunks:
            return []

        query_embedding = self.model.encode(
            [query],
            convert_to_numpy=True,
            normalize_embeddings=True,
            show_progress_bar=False,
        ).astype("float32")

        scores, indices = self.index.search(query_embedding, min(k, len(self.chunks)))

        results: List[Dict[str, str | float]] = []
        for score, idx in zip(scores[0], indices[0]):
            if idx == -1 or float(score) < threshold:
                continue
            results.append(
                {
                    "text": self.chunks[idx],
                    "source": self.metadata[idx]["source"],
                    "score": float(score),
                }
            )
        return results
        