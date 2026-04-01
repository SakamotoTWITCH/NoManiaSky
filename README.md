# No Mania Sky Dogfight

Prototipo multiplayer de batalha espacial feito com Three.js e Playroom Kit para publicar como site estatico no GitHub Pages.

## Como ligar o multiplayer

1. Crie um jogo no portal do Playroom Kit e copie o `gameId`.
2. Abra [playroom.config.js](./playroom.config.js).
3. Preencha `playroomGameId` com o ID gerado no Playroom.
4. Se quiser, ajuste `maxPlayersPerRoom`.

Exemplo:

```js
window.NO_MANIA_SKY_CONFIG = {
  playroomGameId: "SEU_GAME_ID_AQUI",
  maxPlayersPerRoom: 4,
  reconnectGracePeriodMs: 15000,
  roomBaseUrl: ""
};
```

`roomBaseUrl` pode ficar vazio. Quando vazio, o proprio endereco atual da pagina e usado para gerar o link da sala.

## Como publicar no GitHub Pages

1. Envie estes arquivos para um repositorio no GitHub.
2. No repositorio, abra `Settings > Pages`.
3. Em `Build and deployment`, escolha `Deploy from a branch`.
4. Selecione a branch principal e a pasta raiz.
5. Aguarde o GitHub Pages publicar a URL.

Depois disso:

- abra a URL publicada
- o Playroom vai abrir o lobby
- o host cria a sala e clica em `Launch`
- os outros jogadores entram pelo link copiado no botao `Copiar convite`

O jogo usa o hash `#r=` da URL para entrar diretamente na sala, o que funciona bem em hospedagem estatica.

## Rodando localmente

Use `Executar.bat` ou `Executar (Sem Console).bat`.

Se `playroomGameId` estiver vazio, o jogo abre em modo de treino local para facilitar os testes visuais.
