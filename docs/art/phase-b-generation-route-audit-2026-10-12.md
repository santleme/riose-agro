# Fase B — investigação e piloto bovino (2026-10-12)

## Decisão

Nenhum dos dois sprites gerados passou o padrão visual e técnico de Riose. Eles foram preservados como **REPROVADOS**; nenhum asset foi promovido ao manifesto ou ao simulador. A próxima tentativa deve usar Qwen-Image-Edit-2511 no Space público com cota ZeroGPU autenticada, após disponibilizar `HF_TOKEN` local. Para uma conta Free, a cota diária incluída é 5 min e não há necessidade de comprar API ou GPU; não autorizar gasto adicional.

## Referências e critérios aplicados

- `docs/assets/pixel-art-urban-reference.png`: autoridade de estilo, projeção, construção de pixels, contorno, luz, paleta e densidade de detalhe.
- `docs/assets/review-farm-pixel/fazenda-brasileira-completa-v7-candidata.png`: autoridade de contexto rural, escala e composição.
- Reaproveitados `assets/style/style-tokens.json` e `docs/art/reference-measurements-v1.json`: eixos recorrentes próximos de inclinação ±0,5; projeção-alvo 2:1; contorno nativo 1 px (máximo estrutural 2 px); saturação mediana urbana 0,2941; máximo de cinco tons para pelo; luz superior esquerda; clusters nativos deliberados; sem downsample/posterize.

## Rotas verificadas

| Rota | Resultado | Custo / requisito |
|---|---|---|
| `image_gen` integrado | Gerou PNG 1536×1024. Reprovado: sombra/vinheta escura, volume aerografado e contorno grosso; canal alpha sem pixels 255 (525.546 pixels parciais). | Sem API key local nem serviço gráfico instalado. |
| Ollama local | `qwen3.5:0.8b` e `qwen3.5:cloud` estão disponíveis; ambos são texto/visão, nenhum gera imagens. Não há GPU local, PyTorch, Diffusers, `rembg` ou ONNX Runtime verificados. | Execução local de difusão exigiria instalação e hardware de inferência que não estão presentes. |
| Hugging Face Qwen-Image-Edit-2511 Space | API pública aceita galeria com múltiplas referências; execução retornou `event:error` sem detalhe. O código do Space reserva 180 s de GPU; chamadas anônimas têm limite diário de 2 min, então a conta Free precisa ser autenticada para sua cota de 5 min. | **US$ 0** dentro da cota Free; requer token HF de leitura disponível localmente em `HF_TOKEN`. Sem token não chamar a cota autenticada. O modelo tem licença Apache-2.0. |
| Hugging Face FLUX.2-dev Space | API multi-imagem identificada; chamada terminou em exceção upstream sem mensagem detalhada. A implementação depende também de um Space remoto de codificação de texto. | Space público ZeroGPU; não houve cobrança nem saída. Não seguir por essa variante neste piloto. |
| Hugging Face FLUX.1 Kontext Space | Gerou imagem raster 1232×832 a partir da referência urbana; PNG de avaliação tem alpha opaco. Reprovado: aspecto cartoon/ilustração vetorial, contorno grosso, sem perspectiva iso convincente, chifres e úbere incompatíveis com o boi Nelore pedido. | Sem chave local; cota anônima ZeroGPU. |
| HF Jobs / inferência paga | Capacidades apareceram no catálogo, mas as ferramentas MCP responderam que `hf_jobs`, `model_search` e `space_search` não estavam disponíveis ao servidor; nenhum Job foi lançado. | Jobs são pagos por minuto; sem cotação/consentimento não usar. Para referência, tabela oficial lista T4-small a US$ 0,40/h. Inference Providers exigem token com permissão de inferência e podem cobrar após o crédito gratuito. |
| Canva | A tentativa anterior retornou `quota_exceeded`; nenhuma imagem foi criada. | Não usar novamente como requisito. |

As Spaces ZeroGPU públicas aceitam API Gradio; a documentação oficial indica 2 min/dia anônimos, 5 min/dia em conta Free e US$ 1/10 min de excedente somente em planos pagos. Este ambiente não tem token HF local; o contexto MCP confirma autenticação Free, mas os tokens não são expostos ao processo local e o escopo OAuth disponível não inclui inferência. Portanto, a próxima execução deve usar somente a cota grátis, sem preencher cartão nem comprar créditos.

Para recorte de alpha, `BiRefNet` está publicado sob licença MIT e é candidato para o próximo passo de matte/limpeza de borda. `RMBG-2.0` da Bria é não comercial nos pesos públicos; o projeto não deve usá-lo para produção comercial sem contrato/API licenciada.

## Artefatos gerados e auditoria

- [Comparação visual com as duas referências](../../assets/previews/pilot-v2/rejected/reference-comparison-v1.png)
- [Saída direta do gerador integrado — reprovada](../../assets/previews/pilot-v2/rejected/nelore-imagegen-direct-v1-rejected.png)
- [Saída FLUX.1 Kontext — reprovada](../../assets/previews/pilot-v2/rejected/nelore-flux-kontext-v1-rejected.png)
- [Medições de alpha e hashes](../../assets/previews/pilot-v2/rejected/alpha-audit.json)

A primeira imagem tem zero pixels completamente opacos e 525.546 pixels de alpha parcial; a segunda é RGB opaca após conversão sem perdas de conteúdo de WebP para PNG. Não foram aplicados filtros de pixelização, posterização, remoção cromática ou threshold para disfarçar a falha.

## Próximo passo concreto

Disponibilizar no ambiente local um Hugging Face user access token com permissão de leitura, configurado como `HF_TOKEN` (não enviar o segredo no chat). Com isso, executar **um único** piloto no Qwen-Image-Edit-2511 usando as imagens urbana, V7 e Nelore como referências com papéis explícitos; validar estilo em 100%, 50% e 25%; só então aplicar matte via BiRefNet e exportar PNG. Se a cota grátis não estiver disponível, parar antes de qualquer serviço pago e informar o valor antes de pedir autorização.
