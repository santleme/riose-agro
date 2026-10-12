# Interface de modelos científicos

O módulo `scientific/model-contract.js` define um contrato opt-in para adaptadores científicos. Um modelo declara `id`, `version`, versão da interface, campos e tipos de `inputs` e `outputs`, metadados de `evidence` e a função `run(inputs)`. `runScientificModel` valida os campos declarados antes e depois da execução e devolve a saída junto com a versão e a evidência do modelo.

`scientific/br_corte_dmi_adapter.js` demonstra o contrato envolvendo a função já existente de DMI BR-CORTE. Os metadados apontam para a fonte publicada e seus intervalos de validação, e esclarecem que isso não representa calibração ou validação com observações da Riose.

O engine JavaScript permanece o caminho padrão. Ele não importa nem exige um módulo científico; uma integração futura pode injetar um adaptador no ponto de uso desejado, sem substituir snapshots, manifests, replay ou mudar a simulação existente. Esta entrega não extrai outros módulos nem introduz um registry.

O contrato cobre campos de primeiro nível e tipos primitivos. Validações específicas do domínio continuam dentro de `run`; o wrapper não define parâmetros globais, escolhe modelos científicos ou afirma validade biológica.
