"""Speaker-specific evidence for factual preferences, never model drafts."""
import re
from backend.answers import _normalize
from backend.validation import owner_notes
from backend.prompt import _bounded_notes

_VIEWER_ASSERTION = re.compile(
    r"\b(?:you (?:really |clearly |seem to )?(?:(?:like|love)(?! to\b)|prefer|enjoy|have (?:a )?good taste)|"
    r"tu (?:aimes|adores|preferes|as (?:un )?(?:bon )?gout)|vous (?:aimez|preferez)|"
    r"te (?:gusta|gustan|encanta|encantan)|prefieres|tienes (?:buen )?gusto|"
    r"voce (?:gosta|adora|prefere)|tu gostas)\b")
_PREFERENCE_QUESTION = re.compile(r"\b(?:which colou?r do i like|what(?: is| s) my favou?rite|"
    r"quel(?:le)? est (?:ma|mon) .*prefere|cual es mi .*favorit|qual e (?:minha|meu) .*favorit)\b")
_UNKNOWN = re.compile(r"\b(?:i (?:(?:actually|really|honestly) )?(?:don t|do not) know|i (?:am|m) not sure|you haven t told me|"
    r"je ne sais pas|tu ne m as pas dit|no (?:lo )?se|no me has dicho|nao sei|voce nao me disse)\b")
_REQUESTED_GUESS = re.compile(r"\b(?:guess|take a guess|devine|adivina|adivinhe|chuta)\b")
_FACT = re.compile(r"\b(?:i (?:(?:do not|don t) )?(?:like|love|prefer|enjoy|hate|dislike)|my .*favou?rite|j aime|je (?:prefere|adore|deteste|n aime pas|ne prefere pas)|"
    r"m(?:a|on|es) .*prefere|me (?:gusta|gustan|encanta)|prefiero|mi .*favorit|"
    r"(?:eu )?gosto|(?:eu )?prefiro|minh[ao] .*favorit)\b")
_STOP = set("the a an other person viewer interlocutor has have likes like loves love prefers prefer enjoys enjoy favorite favourite colour color preference for is are to of in and their his her you your i my le la les un une tu vous ton ta tes aime aimes gout bon pour de des el la los las te gusta gustan favorito favorita eu voce gosta favorito favorita".split())



def _neutral_question(text):
    normalized = _normalize(text)
    if re.search(r"(?:don t you|n est ce pas|nao e|no es asi|verdad)$", normalized):
        return False
    return bool(re.match(r"(?:what|which|do you|would you|how about|you (?:like|love|prefer|enjoy)|aimes tu|tu aimes|vous aimez|est ce que|quel|quelle|te gusta|prefieres|voce gosta|tu gostas)\b", normalized))


def _questions(draft):
    # Locate the question itself, including after a polite introductory clause;
    # commas inside a list of genres remain part of that question.
    start = r"(?:what|which|do you|would you|how about|you (?:like|love|prefer|enjoy)|aimes tu|tu aimes|vous aimez|est[- ]ce que|quel(?:le)?|te gusta|prefieres|voc[eê] gosta|tu gostas)\b"
    for match in re.finditer(r"(?:^|[,.!;:—])\s*("+start+r"[^.!?;—]*\?)", draft, re.I):
        if _neutral_question(match[1]):
            yield match


def viewer_preference_required(draft, incoming):
    target = _normalize(incoming)
    statements = draft
    for question in reversed(list(_questions(draft))):
        first, last = question.span(1)
        statements = statements[:first]+" "+statements[last:]
    clauses = re.split(r"[.!;—]+|\bbut\b|,\s*(?=(?:you|tu|vous|te|voce)\b)", statements, flags=re.I)
    unknown = any(_UNKNOWN.search(_normalize(clause)) for clause in clauses)
    text = " ".join(_normalize(clause) for clause in clauses if not _UNKNOWN.search(_normalize(clause)))
    if not text:
        return False
    if unknown and not _VIEWER_ASSERTION.search(text):
        return False
    if _REQUESTED_GUESS.search(target) and re.search(r"\b(?:guess|maybe|i d say|perhaps|peut etre|tal vez|quizas|talvez)\b", text):
        return False
    # A genuine question/invitation is not a claim about the other person.
    if re.match(r"(?:do you|would you|what do you|est ce que|aimes tu|te gusta|voce gosta)\b", text) and '?' in draft:
        return False
    return bool(_VIEWER_ASSERTION.search(text) or _PREFERENCE_QUESTION.search(target))



def question_citation(draft, quote):
    """Recognize only a quote of an actual preference question in the draft."""
    if not isinstance(quote,str):
        return False
    for question in _questions(draft):
        if _normalize(quote) == _normalize(question[1]):
            return True
    return False

def _facts(text, *, manual=False):
    kept=[]
    for line in text.splitlines():
        for part in re.split(r"(?<=[.!?])\s+", line):
            normalized=_normalize(re.sub(r"^\s*-\s*(?:Interlocutor|Usuario)(?:\s*\([^)]*\))?\s*:", '', part))
            if not re.match(r"(?:what|which|do i|did i|quel|quelle|cual|que color|qual)\b", normalized) and (_FACT.search(normalized) or (manual and re.search(r"\b(?:favou?rite|favorit[oa]|viewer preference|likes|loves|prefers|enjoys|hates|dislikes)\b", normalized))):
                kept.append(part)
    return "\n".join(kept)


def viewer_evidence(incoming, context, notes, *, preferences=False):
    owner_ids={id(note) for note in owner_notes(notes)}
    streams={"target":incoming,
             "history":"\n".join(line for line in context.splitlines() if re.match(r"\s*-\s*Interlocutor(?:\s*\([^)]*\))?\s*:",line)),
             "notes":_bounded_notes([note for note in notes if id(note) not in owner_ids])}
    return {key:_facts(value,manual=key=="notes") for key,value in streams.items()} if preferences else streams


def preference_anchor(claim, quote):
    """A topic-only quote is not evidence for a newly invented preference value."""
    def words(text):
        return {w for w in _normalize(text).split() if w not in _STOP and len(w)>2}
    negative = re.compile(r"\b(?:don t|do not|does not|dislike|dislikes|hate|hates|detest|no me gusta|nao gosto|n aime pas|ne .*pas)\b")
    if bool(negative.search(_normalize(claim))) != bool(negative.search(_normalize(quote))):
        return False
    return bool(words(claim) & words(quote))
