from typing import Any, Optional, List, Dict

import chromadb
from chromadb.config import Settings as ChromaSettings

from app.config import settings
from app.core.ollama import ollama_service


class VectorStore:
    """ChromaDB vector store for document embeddings."""

    COLLECTION_NAME = "documents"

    def __init__(self):
        self.client = chromadb.PersistentClient(
            path=str(settings.chroma_dir),
            settings=ChromaSettings(anonymized_telemetry=False),
        )
        self.collection = self.client.get_or_create_collection(
            name=self.COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )

    async def add_documents(
        self,
        chunks: List[str],
        document_id: str,
        metadatas: Optional[List[Dict]] = None,
    ) -> List[str]:
        """
        Add document chunks to the vector store.

        Args:
            chunks: List of text chunks
            document_id: ID of the source document
            metadatas: Optional list of metadata dicts for each chunk

        Returns:
            List of chunk IDs
        """
        if not chunks:
            return []

        # Generate embeddings
        embeddings = await ollama_service.generate_embeddings(chunks)

        # Generate unique IDs for each chunk
        chunk_ids = [f"{document_id}_{i}" for i in range(len(chunks))]

        # Prepare metadata
        if metadatas is None:
            metadatas = [{} for _ in chunks]

        # Add document_id to all metadata
        for meta in metadatas:
            meta["document_id"] = document_id

        # Add to collection
        self.collection.add(
            ids=chunk_ids,
            embeddings=embeddings,
            documents=chunks,
            metadatas=metadatas,
        )

        return chunk_ids

    async def search(
        self,
        query: str,
        top_k: Optional[int] = None,
        filter_document_ids: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Search for similar documents.

        Args:
            query: Search query text
            top_k: Number of results to return
            filter_document_ids: Optional list of document IDs to filter by

        Returns:
            List of results with 'content', 'metadata', and 'distance'
        """
        top_k = top_k or settings.retrieval_top_k

        # Generate query embedding
        query_embedding = await ollama_service.generate_embedding(query)

        # Build where filter if document IDs provided
        where_filter = None
        if filter_document_ids:
            where_filter = {"document_id": {"$in": filter_document_ids}}

        # Query collection
        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=top_k,
            where=where_filter,
            include=["documents", "metadatas", "distances"],
        )

        # Format results
        formatted_results = []
        if results["documents"] and results["documents"][0]:
            for i, doc in enumerate(results["documents"][0]):
                formatted_results.append({
                    "content": doc,
                    "metadata": results["metadatas"][0][i] if results["metadatas"] else {},
                    "distance": results["distances"][0][i] if results["distances"] else 0,
                })

        return formatted_results

    def delete_document(self, document_id: str) -> int:
        """
        Delete all chunks for a document.

        Args:
            document_id: ID of the document to delete

        Returns:
            Number of chunks deleted
        """
        # Get all chunks for this document
        results = self.collection.get(
            where={"document_id": document_id},
            include=[],
        )

        if not results["ids"]:
            return 0

        # Delete chunks
        self.collection.delete(ids=results["ids"])
        return len(results["ids"])

    def get_document_chunks(self, document_id: str) -> List[Dict]:
        """
        Get all chunks for a document.

        Args:
            document_id: ID of the document

        Returns:
            List of chunks with content and metadata
        """
        results = self.collection.get(
            where={"document_id": document_id},
            include=["documents", "metadatas"],
        )

        chunks = []
        if results["documents"]:
            for i, doc in enumerate(results["documents"]):
                chunks.append({
                    "content": doc,
                    "metadata": results["metadatas"][i] if results["metadatas"] else {},
                })

        return chunks

    def count(self) -> int:
        """Return total number of chunks in the collection."""
        return self.collection.count()


# Singleton instance
vector_store = VectorStore()
