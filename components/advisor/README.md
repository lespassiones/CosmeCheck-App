# Advisor Components

Composants du module Beauty Advisor (chat IA personnalisé).

## Composants

### `AdvisorChat.tsx`
Interface de chat complète avec bulles de messages, streaming SSE et input.

## Architecture du chat

```
User tape message
  ↓
AdvisorChat.sendMessage()
  ├── Ajoute message user dans messages[]
  ├── Crée message assistant vide (isStreaming: true)
  ├── Appel POST /api/advisor avec SSE
  │     body: { messages, userProfile: preferences }
  │     Authorization: Bearer ${supabase.auth.session.access_token}
  ├── Pour chaque chunk SSE → append au dernier message
  └── À la fin SSE → isStreaming = false
```
