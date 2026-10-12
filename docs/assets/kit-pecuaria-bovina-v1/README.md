# Kit de pecuária bovina v1 — planejamento de produção

Este é o kit candidato de produção para a nova direção focada em pecuária bovina brasileira. O manifesto contém 46 IDs planejados com família, estado, footprint lógico, âncora, dimensões-alvo, compatibilidade de cenário e pacote de atlas. Não há afirmação de que esses sprites já foram gerados ou aprovados; dimensões finais e exports permanecem pendentes até a etapa de arte.

A fonte normativa é [Biblioteca visual — pecuária bovina brasileira](../../pecuaria-bovina-brasileira.md). A referência estética dominante é a [imagem urbana pixel-art limpa](../pixel-art-urban-reference-clean.png). O [inventário de reaproveitamento](asset-reuse-inventory-v1.json) classifica os 27 candidatos antigos como reuso sujeito a revisão, suporte opcional ou extensão futura; nenhum é autoaprovado.

Estados do manifesto: `planned` = fila de produção; `experimental` = exploração não curada; `review` = em avaliação; `approved` = passou pelos gates e pode ser empacotado; `rejected` = preservado com motivo, fora de produção. Promoção para `public/assets/cattle-v1/` só deve ocorrer para `approved`.

Os seis [recipes visuais candidatos](scenario-recipes-candidate-v1.json) organizam cria, recria, engorda, manejo, fazenda tecnificada e demo premium por zonas e IDs do manifesto; são especificações de composição, não dados de runtime. Os pacotes lógicos previstos são pasture-core, livestock-core, fences-core, water-core, props-core, corral-core, buildings-core, vegetation-core, vehicles-core, feed-support e technology-core. Os atlas serão gerados a partir dos exports aprovados; a estrutura candidata não altera nem conecta arquivos ao runtime atual.

O [compositor estático](compose_cattle_scene_candidate.py) demonstra uma montagem cattle-first com imagens PNG existentes e sem agricultura central. A [imagem comparativa](../../review-cattle-pixel/comparativo-referencia-urbana-composicao-modular-v1.png) avalia conteúdo/layout; não aprova estilo nem liga sprites ao runtime.

Validação de estrutura e referências: execute `python3 docs/assets/kit-pecuaria-bovina-v1/validate_manifest.py`. A opção `--check-files` passa a exigir os PNGs apenas quando a biblioteca estiver na fase de exportação.
