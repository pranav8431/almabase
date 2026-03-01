import os
import re
from typing import Dict, List

import faiss
import numpy as np


class SimpleRAG:
    def __init__(self, model_name: str = "all-MiniLM-L6-v2", mode: str = "semantic") -> None:
        self.model_name = model_name
        self.mode = mode
        self.model = None
        self.chunks: List[str] = []
        self.metadata: List[Dict[str, str]] = []
        self.index: faiss.IndexFlatIP | None = None
        self.chunk_tokens: List[set[str]] = []

    def load_documents(self, folder: str = "reference_docs") -> None:
        self.chunks = []
        self.metadata = []
        self.chunk_tokens = []

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

    def _tokenize(self, text: str) -> set[str]:
        return set(re.findall(r"[a-zA-Z0-9]+", text.lower()))

    def build_index(self) -> None:
        if not self.chunks:
            self.index = None
            return

        if self.mode == "keyword":
            self.index = None
            self.chunk_tokens = [self._tokenize(chunk) for chunk in self.chunks]
            return

        try:
            from sentence_transformers import SentenceTransformer

            self.model = SentenceTransformer(self.model_name, device="cpu")
        except Exception as exc:
            if self.mode == "semantic":
                raise exc
            self.mode = "keyword"
            self.index = None
            self.chunk_tokens = [self._tokenize(chunk) for chunk in self.chunks]
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
        if self.mode == "keyword":
            query_tokens = self._tokenize(query)
            if not query_tokens:
                return []

            scored: List[tuple[float, int]] = []
            for idx, chunk_tokens in enumerate(self.chunk_tokens):
                if not chunk_tokens:
                    continue
                overlap = len(query_tokens.intersection(chunk_tokens))
                if overlap == 0:
                    continue
                score = overlap / max(len(query_tokens), 1)
                if score >= threshold:
                    scored.append((float(score), idx))

            scored.sort(key=lambda item: item[0], reverse=True)
            top_scored = scored[:k]

            return [
                {
                    "text": self.chunks[idx],
                    "source": self.metadata[idx]["source"],
                    "score": score,
                }
                for score, idx in top_scored
            ]

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
        