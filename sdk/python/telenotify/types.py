from typing import Any, Dict, List, Literal, Optional, TypedDict, Union

MessageStatus = Literal["QUEUED", "SENT", "UNDELIVERABLE", "FAILED", "RECEIVED"]
UndeliverableReason = Literal["not_linked", "blocked", "chat_gone"]
FailureReason = Literal["telegram_unavailable", "telegram_rejected"]
Locale = Literal["en", "am", "om", "ti"]
MessageFormat = Literal["plain", "markdown"]
LayoutType = Literal["receipt", "alert", "reminder", "status", "info"]
Priority = Literal["normal", "high"]


class InlineButton(TypedDict):
    text: str
    url: str


class LayoutRow(TypedDict, total=False):
    label: str
    value: str
    copy: bool


class Layout(TypedDict, total=False):
    type: LayoutType
    title: str
    emoji: str
    body: str
    rows: List[LayoutRow]
    footer: str


class MessageFallback(TypedDict):
    channel: Literal["sms"]
    status: Literal["queued", "sent", "failed", "skipped"]
    error: Optional[str]
    at: Optional[str]


class Message(TypedDict, total=False):
    id: str
    to: str
    direction: Literal["OUTBOUND", "INBOUND"]
    status: MessageStatus
    priority: Priority
    template: Optional[str]
    locale: Optional[Locale]
    reason: Optional[Union[UndeliverableReason, FailureReason]]
    text: str
    format: MessageFormat
    plainText: str
    buttons: Optional[List[List[InlineButton]]]
    idempotencyKey: Optional[str]
    error: Optional[str]
    attempts: int
    fallback: Optional[MessageFallback]
    sentAt: Optional[str]
    createdAt: str


class Customer(TypedDict, total=False):
    id: str
    externalId: str
    phone: Optional[str]
    locale: Optional[Locale]
    reachable: bool
    linkedAt: Optional[str]
    blockedAt: Optional[str]
    createdAt: str
    updatedAt: str


class ConnectLink(TypedDict):
    token: str
    url: str


class Verification(TypedDict, total=False):
    id: str
    url: str
    hostedUrl: str
    status: Literal["PENDING", "AWAITING_CONTACT", "VERIFIED", "FAILED", "EXPIRED"]
    reason: Optional[str]
    phone: Optional[str]
    expiresAt: str
    verifiedAt: Optional[str]


class VerificationResult(TypedDict, total=False):
    id: str
    status: Literal["VERIFIED", "FAILED"]
    phone: Optional[str]
    reason: Optional[str]
    exp: int


class MessageTemplate(TypedDict, total=False):
    key: str
    name: str
    description: Optional[str]
    variants: Dict[str, str]
    defaultLocale: str
    format: MessageFormat


class Page(TypedDict, total=False):
    data: List[Any]
    nextCursor: Optional[str]


class WebhookEvent(TypedDict, total=False):
    id: str
    event: str
    createdAt: str
    environment: str
    data: Dict[str, Any]
