# Biblioteca visual — pecuária bovina brasileira

**Direção:** riose-cattle-isometric-v1. **Estado:** guia normativo para nova produção; candidatos não estão aprovados até passar pelo gate. **Referência dominante:** [pixel-art urbana limpa](assets/pixel-art-urban-reference-clean.png), apenas para linguagem visual, acabamento, perspectiva, densidade e paleta; nunca copiar objetos ou layout. A amostra rural aprovada orienta conteúdo e escala.

## 1. Visão e diagnóstico

Ríose é um simulador visual modular de fazenda brasileira focado em **pecuária bovina**, sobretudo gado de corte. Rebanho e manejo são o centro. Pastagem, água, cerca, curral, infraestrutura, veículos, apoio operacional e tecnologia existem para comunicar a operação pecuária.

Agricultura não é tema central. Silagem, milho, feno e suplementação aparecem apenas como apoio quando ajudam a representar a fazenda. Esta etapa cobre direção de arte e produção de assets, não modelo zootécnico, regras de simulação ou arquitetura do motor.

Os atlas semirrealistas existentes comunicam conteúdo, mas não a linguagem pixel-art aprovada: textura pintada, brilho de render, contornos inconsistentes e detalhe difuso. Redução ou filtro não consertam desenho e agrupamento. Os novos sprites devem ser desenhados como pixel art deliberada, curados individualmente e compostos como imagens modulares.

## 2. Bíblia visual

Pixel art isométrica refinada, diorama premium, geometria 2:1, silhuetas nítidas, clusters controlados, contorno escuro fino, sombreamento gráfico em poucos tons, paleta moderadamente dessaturada e microdetalhe funcional. Construções, curral e terreno devem ter a riqueza da referência urbana, reinterpretada para o campo brasileiro.

| Eixo | Regra de produção |
|---|---|
| Projeção | Câmera fixa 3/4; chão 2:1, eixos ±26,6°. Módulo lógico 64×32 px; tile-base 128×64 px; tolerância de inclinação ±0,05 px/px. |
| Escala | Footprint declarado em módulos, nunca inferido do canvas. Ponto de contato ancora o objeto. Valores iniciais: bovino 1×1, árvore 2×2, trator 2×1, casa 3×3, curral 6×5. Validar na cena. |
| Pixels | Degraus deliberados e clusters em massas legíveis; sem ruído aleatório, dithering automático ou pixelização de arte semirrealista por filtro. |
| Contornos | Carvão esverdeado/marrom, 1 px lógico seletivo; até 2 px em silhuetas grandes. Linhas internas leves; não contornar cada folha, telha ou pelo. |
| Luz e sombra | Luz superior esquerda; 3–5 tons chapados por material; sombra curta de contato para baixo/direita. Sem gradiente fotográfico, bloom ou sombra difusa realista. |
| Paleta | Verdes de pasto/folha, terra ocre/vermelha, madeira quente, telha terracota, creme, água azul-esverdeada, metal cinza azulado e pelagens naturais. Saturação e contraste controlados. |
| Densidade | Portas, janelas, telhas em grupos, travessas, dobradiças, rodas, válvulas e trilhos legíveis em zoom médio. A riqueza vem de detalhes intencionais e composição conectada, não de ruído. |
| Animais/vegetação | Pelagem em poucos blocos, sem fio a fio; anatomia reconhecível e estilizada. Copas irregulares em três valores, tronco legível e sem bolotas repetidas. |
| Arquivo | Objetos isolados em PNG RGBA, alpha limpo e RGB transparente sem matte colorido. Sem chão embutido. Tiles declaram conectores e bordas. |

Reprovar concept art, pintura semirrealista, render 3D, visual de jogo mobile, gradientes fotográficos, brilho plástico, contorno preto grosso, micro-ruído, anti-alias borrado, pixelização por filtro, luz/câmera divergente, fundo sólido, halo, escala sem âncora ou costura de tile.

**Gate de aceite:** comparar lado a lado com a referência urbana; revisar em 100%, 50% e 25%; conferir alpha em fundo claro/escuro/quadriculado; testar tiles em 3×3 e conectores em conjunto; compor a cena pecuária completa. Um render de cena não aprova os sprites individuais. Qualquer falha de estilo volta para correção antes de expandir a biblioteca.

## 3. Famílias e estados

| Família | Conteúdo |
|---|---|
| Rebanho | Nelore adulto, vaca, touro, novilha, bezerro e lote; poses em pé, andando, pastando, bebendo, descansando, no cocho, em piquete e em manejo. |
| Pastagem/solo | Pasto alto, médio, baixo/pastejado, seco/degradado; pisoteado, solo exposto, úmido/lama, trilha, sombra e transições. |
| Água | Bebedouro metálico/concreto, caixa, reservatório, ponto de abastecimento, açude, margem e área úmida pisoteada. |
| Cercas | Cerca reta/canto de arame ou madeira, porteira, divisão de piquete, corredor, acesso e cerca reforçada. Conectores explícitos. |
| Manejo/curral | Módulos de curral/espera/apartação, corredor, tronco/brete, balança, embarcadouro e área de manejo. |
| Alimentação | Cocho, saleiro, fardos e suplemento. Estados vazio, abastecido e parcialmente consumido. Lavoura só como suporte. |
| Edificações | Sede, casa de apoio, galpão, depósito, oficina e abrigo de equipamento/manejo. |
| Veículos | Caminhonete genérica, caminhão boiadeiro, trator de apoio, reboque, moto/quadriciclo opcional; sem marca ou logo. |
| Vegetação/props | Árvores de sombra, arbustos, capim, margem d’água, rochas, mourões, pneus, tambores, ferramentas e sinalização sem texto. |
| Tecnologia | Brinco, leitor, poste/antena, gateway, caixa/estação técnica, balança conectada e overlay discreto de animal monitorado. Sem ficção exagerada. |

Estados compostos: rebanho parado/andando/pastando/bebendo/descansando/agrupado/isolado/em manejo; pasto alto/médio/baixo/seco/degradado/pisoteado; água limpa/usada/margem pisoteada; curral vazio/preparado/ocupado; tecnologia passiva/ativa/lendo/selecionada. Marcadores de UX são camada opcional, nunca parte do sprite base.

## 4. Cenários prioritários

1. **Cria:** vacas e bezerros, piquete tranquilo, sombra, água e apoio simples.
2. **Recria rotacionada:** piquetes menores, corredor, pastos em estados diversos e água distribuída.
3. **Engorda a pasto:** lote Nelore, pasto médio/baixo, cocho/saleiro, bebedouro e trilha para curral.
4. **Manejo e pesagem:** curral denso, apartação, brete, balança, embarcadouro, caminhão e leitor.
5. **Fazenda tecnificada:** brincos, antena/gateway e sinalização de lote discreta.
6. **Demo premium:** cena conectada com sede, galpão, curral, piquetes, açude, estradas, rebanho, máquinas e suporte alimentar pontual.

## 5. Kit-base v1

O manifesto candidato em [kit-pecuaria-bovina-v1](assets/kit-pecuaria-bovina-v1/manifest-candidate-v1.json) contém 46 IDs planejados: 7 animais; 6 pasto/solo; 5 água/alimentação; 8 cerca/manejo; 2 edifícios; 3 veículos; 4 vegetação; 5 tecnologia; 6 estrada/props. A seleção monta uma cena completa e suporta estados visuais sem fazer da lavoura protagonista. As [seis receitas visuais](assets/kit-pecuaria-bovina-v1/scenario-recipes-candidate-v1.json) vinculam zonas e IDs aos cenários de cria, recria, engorda, manejo, tecnificação e demo; são receitas de composição, não cenários de runtime. “Planned” indica necessidade, não sprite aprovado.

## 6. Prompts prontos

Anexe a referência urbana limpa como guia dominante de estilo e a amostra rural aprovada somente como guia de conteúdo/escala. Gere um asset por chamada.

### Prompt-base universal

> Create ONE [ASSET + VARIANT] for a modular Brazilian cattle ranch simulator. Match the supplied urban isometric pixel-art reference for pixel density, clean geometry, fine selective outline, restrained palette, light, microdetail and premium game-map finish; reinterpret the language only, never copy its objects or layout. Use the rural sample only for subject and logical scale. Refined hand-crafted 2:1 isometric pixel art, fixed 3/4 camera, crisp stepped edges, deliberate readable clusters, thin dark colored contours, 3–5 flat shades per material, upper-left light, short lower-right contact shadow, moderately desaturated Brazilian pasture/earth/timber/terracotta/cream/blue-green palette. Subject: [shape, material, state, distinctive details]. Footprint [W×H logical modules], ground anchor [x,y], orientation [axis]. One isolated production sprite, PNG RGBA, clean transparency and no colored fringe; no baked ground. For a ground tile use native 128×64 diamond with matching declared edges and transparent exterior. Avoid painterly/semi-realistic texture, concept art, 3D/mobile-game gloss, photo gradients, realistic soft shadows, blur, pixelation filters, random micro-noise, thick black outline, text, logos, watermark, border, halo or neighboring assets.

### Prompts específicos (um sprite por chamada)

1. **Boi Nelore adulto:** adult calm beef Nelore, standing 3/4 iso, 1×1; light cream coat, distinct hump and dewlap, short dark muzzle, readable ears, four separated legs and tail; broad coat clusters, few shadow blocks.
2. **Vaca Nelore:** adult cow with lighter compact body, recognizable hump/dewlap and small udder detail; calm standing pose, 1×1, same scale/anchor as bull.
3. **Bezerro:** young cream Nelore calf, slim short-legged body, proportionally larger head/ears and subtle hump hint; 1×1, isolated, no scenery.
4. **Touro:** robust mature breeding bull, broad chest/hump/dewlap, calm alert stance; distinguish mass by clusters, not gradients; 1×1.
5. **Novilha:** young heifer between calf and cow in size, slim body, subtle hump, neutral stance; four clear legs and same cattle palette.
6. **Lote:** exactly five Nelore cattle in a compact 3×2 composition, mixed adult/calf sizes, clear gaps, no hidden legs, shared light and transparent background.
7. **Bovino andando:** one Nelore in a single walking pose, one foreleg raised, stable silhouette relative to standing variant; no motion blur.
8. **Pasto alto (tile):** seamless 128×64 diamond, healthy Brazilian pasture with grouped mid-height tufts, muted greens, a few soil pixels; flat ground, matching edges, no pedestal/shadow.
9. **Pasto médio:** same tile family and edges, medium grazable pasture, more open than tall pasture, purposeful olive clusters, no flowers or rocks.
10. **Pasto baixo:** short broken tufts, visible muted green ground and few warm-earth pixels; same level and exact diamond bounds, no cattle.
11. **Pasto seco/degradado:** stressed pasture, dry olive/ochre tufts and sparse red-earth patches; organized clusters, not dirt noise; same edges.
12. **Solo pisoteado úmido:** compacted dark earth near trough, 3–5 grouped hoof marks, restrained blue-green wet pixels and sparse grass; no glossy reflection.
13. **Bebedouro metálico:** galvanized 1×1 rectangular trough, clean rim, four short legs, flat blue-green water plane, simple float valve; no ground tile.
14. **Bebedouro de concreto:** compact 1×1 concrete trough, pale gray sides, dark water opening, simple inlet pipe and controlled wear pixels.
15. **Cerca reta:** three weathered posts, two thin dark wires, 2:1 ground axis, exact endpoint connection anchors, no grass tile.
16. **Cerca de canto:** 90-degree join for straight modules, same post spacing/height/wires, exact endpoints and clean connected wires.
17. **Porteira:** closed timber-and-wire gate, diagonal brace, latch and two exact fence connections; opening suits cattle and small vehicle.
18. **Curral modular:** 6×5 layout, timber rails, clear posts, gate opening, holding pen and lane to chute; dense but organized, no animals or baked dirt.
19. **Brete/balança:** 2×1 steel/timber chute with squeeze sides, head gate, low platform scale and small indicator box; no readable screen text or branding.
20. **Cocho:** 2×1 long bunk in weathered timber or muted enamel, short supports, grouped feed; empty/partially filled as separate states.
21. **Saleiro:** 1×1 shallow mineral basin under small pitched rain roof on sturdy posts; pale mineral fill and readable supports.
22. **Sede rural:** 3×3 cream masonry house, terracotta roof in pixel bands, shaded veranda, two windows, timber door, steps and eave detail; no landscaping.
23. **Galpão pecuário:** 5×3 open-sided shed, rafters/posts, muted roof, visible feed/tool storage and clear machinery bay; no vehicle or ground.
24. **Caminhão boiadeiro:** generic 3×1 truck, compact cab, ventilated animal body with repeated rails, readable wheels/rear access; no brand, plate, text or cattle.
25. **Caminhonete:** generic double-cab green pickup, cream lower trim, clear windows/tires/open bed, no badge or legible plate.
26. **Trator de apoio:** unbranded compact green tractor, 2×1, two wheel sizes, grouped treads, yellow hubs, step and rear hitch; no trailer.
27. **Árvore de sombra:** 2×2 pasture tree, visible branching trunk, irregular canopy in three muted greens, sky gaps, no round repeated leaf blobs.
28. **Açude:** small 4×3 ground-plane pond, blue-green flat water, earthen bank, few reeds and tiny pixel highlights, transparent exterior.
29. **Brinco inteligente:** close-up inventory sprite of plain cream/yellow polymer ear tag with blank dark inset; no number, logo, glow or text; not at this scale on animal.
30. **Leitor:** handheld tag reader, compact sensor head and handle, abstract two-tone screen pixels, no brand or readable text.
31. **Gateway/antena:** weatherproof small box on short pole, simple antenna/cable, green-gray hardware, 1×1 footprint, no neon or branding.
32. **Poste leitor:** fixed reader beside handling lane, box, two small antenna panels, cable and quiet status light; plausible farm hardware.
33. **Marcador UX:** separate muted teal pixel bracket/ring and one status pip above monitored animal; no text, large glow or hologram.
34. **Props de suplemento:** one unbranded bale, plain sack, mineral container, drum or pallet per sprite, declared footprint, few wear pixels, no labels.

## 7. Pastas, estados e governança

    public/assets/cattle-v1/
      manifest.json
      atlases/
      exports/{animals,pasture,water,fences,corral,feed,buildings,vehicles,vegetation,technology,props,roads}/
    docs/assets/kit-pecuaria-bovina-v1/
      manifest-candidate-v1.json
      source/ review/ approved/ rejected/ experimental/
    docs/asset-pipeline/
      style-guide.md prompts/ change-log.md

- **source:** original imutável/editável, prompt, referência, data, hash; nunca runtime.
- **exports:** PNG RGBA curado com ID/revisão.
- **review:** thumbnails, provas de alpha, contato, repetição 3×3 e cena.
- **approved:** passou gate e pode entrar em pack.
- **experimental/rejected:** fora de produção, com motivo preservado.
- Atlas é derivado de exports aprovados; a fonte visual continua sendo o sprite individual.
- IDs kebab-case: animals-nelore-cow-standing-01; revisão de arte muda revision/arquivo, não ID estável. Metadados registram estado, variantes e predecessor.
- Manifesto registra id, categoria/família, arquivo, variantes/estado, dimensões-alvo e finais, módulo, footprint, anchor normalizada, tags, cenários, versão de estilo, status, atlas/frame, conectores e notas. O validador verifica IDs, âncoras, tamanhos-alvo, compatibilidade e referências de cena; os tamanhos finais ficam pendentes até o sprite existir.
- Pacotes: sempre disponíveis pasture-core, livestock-core, fences-core, water-core, props-core; por cena corral-core, buildings-core, vegetation-core, vehicles-core, feed-support; sob demanda livestock-variants, technology-core, pacotes regionais e overlays.
- Separar tiles do atlas de props; extrusion/padding transparente 2–4 px, nearest-neighbor, sem alpha bleed. Pacotes raros carregam sob demanda; manifesto mantém versões e hashes.

## 8. Pipeline, limites e próximo teste

1. Registrar necessidade, família, estado, footprint, âncora e compatibilidade.
2. Combinar prompt universal + específico e gerar uma variante por chamada com a referência dominante.
3. Curar estilo e silhueta antes de mexer no alpha; falha painterly/3D retorna à arte.
4. Corrigir a fonte; limpeza de matte pode apenas tratar alpha/RGB transparente, sem redimensionar, quantizar ou redesenhar clusters.
5. Exportar PNG, thumbnail e provas sobre fundos claros/escuros; validar escala, âncora, alpha, tile/conector.
6. Montar cena, comparar com a referência, registrar decisão; somente aprovados entram no atlas/manifesto de produção.
7. Revisar novamente após integração, sem atribuir à arquitetura do simulador o trabalho de desenhar a arte.

Preservar seed, motor de simulação, layout, interações e câmera atuais. Reclassificar atlas semirrealistas como legado de continuidade, não referência estética. O [inventário de reaproveitamento](assets/kit-pecuaria-bovina-v1/asset-reuse-inventory-v1.json) classifica individualmente os 27 candidatos do kit misto como reuso condicionado ao gate, suporte opcional ou extensão futura. Lavouras ficam em suporte alimentar opcional; shapes do runtime são fallback temporário. **Não alterar arquitetura, motor ou renderer nesta etapa.**

As cenas completas geradas estão comparadas à referência: [v3](assets/review-cattle-pixel/comparativo-referencia-urbana-fazenda-v3-reprovada.png), [v4](assets/review-cattle-pixel/comparativo-referencia-urbana-fazenda-v4-review.png), [v5](assets/review-cattle-pixel/comparativo-referencia-urbana-fazenda-v5-reprovada.png) e [v6](assets/review-cattle-pixel/comparativo-referencia-urbana-fazenda-v6-reprovada.png); todas falharam o gate de estilo. A [composição modular com PNGs existentes](assets/review-cattle-pixel/comparativo-referencia-urbana-composicao-modular-v1.png) valida zonas e conteúdo pecuário, mas também fica aquém em densidade e não aprova sprite algum. O [registro de revisão](assets/review-cattle-pixel/README.md) define a correção: produzir/curar sprites pequenos nativos de casa, árvore, bovino e tile de pasto, ajustar clusters/contorno e só então remontar a cena. Não ampliar a biblioteca enquanto esse gate estiver reprovado.
