"""Multi-agent revenue generation system powered by local google/gemma-4-E4B-it.

Agents:
  - OverseerAgent            (manager: orchestration + feedback loop)
  - MarketIntelligenceAgent  (researcher)
  - ContentSEOAgent          (optimizer)
  - OutreachAgent            (action)
  - PaymentServicesAgent     (subscription & payment monitor + LLM insights)

Usage:
  python -m agents.revenue run --goal "Increase affiliate sales 10% this month"
  python -m agents.revenue services --api-url https://wise-ravens.com/api
  python -m agents.revenue demo          # dry-run, no model needed
  python -m agents.revenue status
"""
from .core import BaseAgent, GemmaClient, StateStore, Task
from .agents import ContentSEOAgent, MarketIntelligenceAgent, OutreachAgent, screen
from .overseer import OverseerAgent
from .services_agent import NuRavenLLMClient, PaymentServicesAgent, WiseravenAPIClient

__all__ = [
    "BaseAgent", "GemmaClient", "StateStore", "Task",
    "ContentSEOAgent", "MarketIntelligenceAgent", "OutreachAgent",
    "OverseerAgent", "screen",
    "PaymentServicesAgent", "WiseravenAPIClient", "NuRavenLLMClient",
]
