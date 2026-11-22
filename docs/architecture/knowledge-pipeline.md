# Knowledge pipeline

Capture converts source HTML, document text, notes, or transcripts into numbered passages. The knowledge pipeline chunks passage text and records the passage indices each chunk covers. It keeps provider-generated output tied to saved evidence.

```mermaid
flowchart TD
    Source[Saved passages]
    Chunk[Chunk text and record offsets]
    Index[(Keyword index)]
    Embed[Optional embeddings]
    Vector[(Vectors for the active model)]
    Analyze[Optional structured chat analysis]
    Evidence[(Summaries, topics, and graph evidence)]
    Search[Rank and retrieve passages]
    Citation[Citation opens the reader at the saved offsets]

    Source --> Chunk
    Chunk --> Index
    Chunk --> Embed --> Vector
    Chunk --> Analyze --> Evidence
    Index --> Search
    Vector --> Search
    Search --> Citation
```

Saved content is untrusted. Prompts identify source content as evidence, and the structured adapter validates responses before storing them. Failed optional model calls leave saved reading accessible. Keyword search stays available during embedding rebuilds. [Search and citations](search.md)
