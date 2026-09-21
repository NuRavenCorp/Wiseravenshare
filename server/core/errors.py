class WiseravenError(Exception):
    """Base for all server-level errors."""


class PlatformNotRegistered(WiseravenError):
    pass


class CapabilityNotSupported(WiseravenError):
    pass


class WebhookVerificationFailed(WiseravenError):
    pass


class CredentialMissing(WiseravenError):
    pass
