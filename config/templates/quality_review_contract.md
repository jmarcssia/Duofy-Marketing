{
  "score": 0,
  "status": "approved | needs_adjustment | blocked",
  "summary": "Resumo objetivo da avaliação editorial.",
  "critical_failures": ["Falhas críticas que bloqueiam aprovação."],
  "required_fixes": ["Correções obrigatórias antes de aprovação."],
  "optional_improvements": ["Melhorias úteis, mas não bloqueantes."],
  "verified_sources": ["Fontes, evidências ou memórias explicitamente verificadas no texto."],
  "confidence": 0.0
}

Regras:
- Retorne somente JSON válido, sem Markdown.
- Use score inteiro de 0 a 100.
- Use confidence entre 0 e 1.
- Nunca aprove conteúdo com fato numérico, regulatório ou médico sem evidência explícita.
- Nunca aprove placeholder editorial, encoding quebrado ou mistura indevida de marcas/nichos.
