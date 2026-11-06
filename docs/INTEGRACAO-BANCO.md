# Integração com banco de dados (Supabase)

**Situação: não implementada e não testada.** O sistema funciona com o servidor local. Este guia descreve o que falta para trocar por Supabase, caso o campeonato precise ficar acessível fora da rede interna.

## Ponto de troca

Toda a persistência passa pela classe `Store`, em `app/js/core/store.js`. Nenhuma tela fala com a rede diretamente. Basta um terceiro modo que implemente:

| Método | Responsabilidade |
|---|---|
| `init()` | Carrega o documento e assina as mudanças |
| `update(fn)` | Aplica `fn` em uma cópia e publica |
| `login(password)`, `logout()`, `setupPassword(password)` | Sessão de administrador |
| `saveAvatar(id, avatar, code)` | Grava o avatar de um jogador, autorizado pelo código |
| `playerCode(id)` | Devolve o código pessoal, só para administrador |

## Esquema sugerido

```sql
create table tournament (
  id int primary key default 1 check (id = 1),
  rev bigint not null default 0,
  doc jsonb not null,
  updated_at timestamptz not null default now()
);

alter table tournament enable row level security;

create policy "leitura publica" on tournament
  for select using (true);

create policy "escrita do administrador" on tournament
  for update using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

alter publication supabase_realtime add table tournament;
```

## O que muda em cada parte

- **Sincronização:** trocar o `EventSource` por `supabase.channel(...).on('postgres_changes', ...)`.
- **Revisão:** gravar com `update ... where rev = $esperado`. Zero linhas afetadas equivale ao 409 de hoje.
- **Login:** usar Supabase Auth, com um único usuário administrador.
- **Avatar do participante:** criar uma Edge Function com o segredo do HMAC, equivalente ao `SaveAvatar` de `server/TutoryServer.cs`. O segredo não pode ir para o frontend.

A chave `anon` do Supabase pode ficar no frontend, porque quem protege os dados é a RLS. A chave `service_role` nunca pode.
