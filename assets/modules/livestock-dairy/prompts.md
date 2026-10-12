# Riose — prompts de produção do módulo leiteiro

Use as três referências catalogadas no `catalog.json`: referência urbana para linguagem visual, fazenda V7 para composição rural e bovino ImageGen aprovado para anatomia bovina. Gerar imagens raster reais; manter original, recortar para PNG RGBA, remover apenas fundo/halo sem filtros de estilo e registrar dimensões/âncora no manifesto. Iluminação superior esquerda, isometria 2:1, contornos finos, agrupamentos de pixel controlados e paleta moderadamente dessaturada.

## Arquétipos leiteiros

“Sprite individual premium ilustrado em isometria 2:1 para simulador brasileiro Riose. [Holandesa manchada / Girolando branco com manchas escuras / novilha leiteira / bezerra leiteira] reconhecível pela silhueta e proporções corretas, pose neutra em pé, vista três quartos, quatro patas visíveis, volume natural sem render 3D, contornos finos e precisos, detalhes pequenos de pelagem agrupados, luz superior esquerda, escala e sombra de contato compatíveis com o bovino Nelore aprovado. Fundo totalmente transparente, sem placa de chão, sem texto, sem interface, sem outros animais.”

## Manejo e ordenha

“Sprite modular isométrico 2:1 de [sala de ordenha/curral de espera], infraestrutura leiteira brasileira construída com materiais rurais plausíveis. Silhueta legível em miniatura, módulos conectáveis, entradas e corredores claros, ferragens e divisórias com microdetalhes intencionais, madeira/concreto/metal em poucos tons, iluminação superior esquerda, linha fina, sombra gráfica curta. Fundo transparente, ponto de ancoragem no solo, sem animais, sem texto, sem cenário de fundo.”

## Tecnologia

“Sprite de equipamento pecuário realista estilizado para Riose: [coleira de atividade com sensor compacto / gateway e antena / leitor RFID portátil]. Forma funcional simples, acabamento rural robusto, escala consistente com vacas e instalações, poucos realces, contorno delicado, luz superior esquerda, transparência limpa sem halo. Sem logos, texto, interface ou brilho futurista.”

## Estados e overlays

Estados operacionais devem ser camadas reutilizáveis ancoradas ao equipamento ou zona existente: nível de água/ração troca o preenchimento do cocho, operação ativa usa sinal discreto, identificação usa pequeno marcador/brinco, seleção usa contorno fino e baixo contraste. Não recriar o sprite-base para estados nem adicionar partículas decorativas permanentes.
