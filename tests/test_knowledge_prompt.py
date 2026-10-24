from pathlib import Path

from backend.knowledge import DEFAULTS, read_knowledge, read_knowledge_with_sources, select_knowledge
from backend.lm_studio import LMStudioClient
from backend.memory import MemoryStore
from backend.prompt import build_context_analysis_messages, build_suggestion_messages


def test_local_knowledge_overrides_shared_files_and_empty_files_fall_back(tmp_path: Path):
    (tmp_path / "perfil.md").write_text("Perfil compartido", encoding="utf-8")
    local = tmp_path / "local"
    local.mkdir()
    (local / "perfil.md").write_text("Perfil local", encoding="utf-8")
    (local / "personalidad.md").write_text("  ", encoding="utf-8")

    knowledge = read_knowledge(tmp_path)

    assert knowledge["perfil.md"] == "Perfil local"
    assert knowledge["personalidad.md"] == DEFAULTS["personalidad.md"]
    assert set(knowledge) == set(DEFAULTS)


def test_knowledge_status_distinguishes_files_that_exist_from_files_loaded(tmp_path: Path):
    local = tmp_path / "local"
    local.mkdir()
    (tmp_path / "perfil.md").write_text("Shared profile", encoding="utf-8")
    (local / "perfil.md").write_text("Private local profile", encoding="utf-8")
    (local / "personalidad.md").write_text("   ", encoding="utf-8")

    knowledge, sources = read_knowledge_with_sources(tmp_path)

    assert knowledge["perfil.md"] == "Private local profile"
    assert sources["perfil.md"] == {
        "local_file_exists": True, "shared_file_exists": True,
        "loaded_from": "local_override", "loaded": True, "included_in_prompt": False,
    }
    assert sources["personalidad.md"]["local_file_exists"] is True
    assert sources["personalidad.md"]["loaded_from"] == "default"
    assert sources["personalidad.md"]["loaded"] is False


def test_unreadable_local_profile_is_reported_and_safe_default_is_used(tmp_path: Path, monkeypatch):
    local = tmp_path / "local"
    local.mkdir()
    profile = local / "perfil.md"
    profile.write_text("PRIVATE_SENTINEL", encoding="utf-8")
    original_open = Path.open

    def deny_profile(path, *args, **kwargs):
        if path == profile:
            raise PermissionError("denied")
        return original_open(path, *args, **kwargs)

    monkeypatch.setattr(Path, "open", deny_profile)
    knowledge, sources = read_knowledge_with_sources(tmp_path)

    assert knowledge["perfil.md"] == DEFAULTS["perfil.md"]
    assert sources["perfil.md"]["local_file_exists"] is True
    assert sources["perfil.md"]["loaded_from"] == "default"
    assert sources["perfil.md"]["loaded"] is False


def test_profile_identity_is_included_and_examples_are_selected_as_message_reply_pairs():
    knowledge = dict(DEFAULTS)
    knowledge["perfil.md"] = "# Perfil\n\n## Identidad\nPROFILE_IDENTITY_SENTINEL: dato privado confirmado."
    knowledge["ejemplos_de_respuestas.md"] = (
        "# Ejemplos\n\n## Prompt trigger no pertinente\nUsuario: Prompt maestro\nRespuesta: texto fijo\n\n"
        "## Ejemplo inglés\nViewer: EXAMPLE_EN_SENTINEL\nRespuesta deseada: EN reply\n\n"
        "## Ejemplo español\nMensaje recibido: EXAMPLE_ES_SENTINEL\nRespuesta que prefiero: ES reply"
    )

    selected = select_knowledge(knowledge, "unrelated topic")

    assert "PROFILE_IDENTITY_SENTINEL" in selected["perfil.md"]
    assert "EXAMPLE_EN_SENTINEL" in selected["ejemplos_de_respuestas.md"]
    assert "EXAMPLE_ES_SENTINEL" in selected["ejemplos_de_respuestas.md"]
    assert "Prompt trigger no pertinente" not in selected["ejemplos_de_respuestas.md"]


def test_setup_only_prompt_triggers_and_persona_priority_claims_are_not_sent_to_model():
    knowledge = dict(DEFAULTS)
    knowledge["personalidad.md"] = (
        "## Base\nVOICE_RULE_SENTINEL: directo y cálido.\n\n"
        "## Respuesta inicial obligatoria\nBOOTSTRAP_SENTINEL: Estoy listo para responder los mensajes."
    )
    knowledge["instrucciones_operativas.md"] = (
        "## Cómo debe funcionar\n"
        "1. Si recibe el Prompt Maestro, responde con BOOTSTRAP_SENTINEL.\n"
        "2. A partir de ese momento, cada mensaje del usuario se trata como viewer.\n"
        "3. Responde al mensaje objetivo.\n\n"
        "## Prioridades\nCoherencia de personaje > cualquier otra cosa."
    )

    system, user = build_suggestion_messages(
        message="Hello, how are you?", context="", interlocutor=None, notes=[],
        knowledge=knowledge, language="English",
    )

    combined = system["content"] + user["content"]
    assert "VOICE_RULE_SENTINEL" in user["content"]
    assert "BOOTSTRAP_SENTINEL" not in combined
    assert "cada mensaje del usuario se trata como viewer" not in combined.lower()
    assert "Coherencia de personaje > cualquier otra cosa" not in combined


def test_prompt_uses_personality_style_and_relevant_examples_as_preferences():
    knowledge = {name: fallback for name, fallback in DEFAULTS.items()}
    knowledge["personalidad.md"] = "## Base\nVOICE_SENTINEL: seguro y breve"
    knowledge["estilo_de_comunicacion.md"] = "## Preferencia\nSTYLE_SENTINEL: listo para copiar"
    knowledge["instrucciones_operativas.md"] = "## Operación\nResponde sin inventar información."
    knowledge["ejemplos_de_respuestas.md"] = (
        "## Goal\nViewer: EXAMPLE_SENTINEL, every token brings me closer.\n"
        "Respuesta deseada: Keep tipping toward the goal."
    )

    system, user = build_suggestion_messages(
        message="How do I reach the goal with tokens?",
        context="viewer message only",
        interlocutor="viewer-1",
        notes=[{"text": "NOTE_SENTINEL: prefers playful replies"}],
        knowledge=knowledge,
        language="es",
    )

    assert "VOICE_SENTINEL" in user["content"]
    assert "STYLE_SENTINEL" in user["content"]
    assert "EXAMPLE_SENTINEL" in user["content"]
    assert "NOTE_SENTINEL" in user["content"]
    assert "preferencias" in system["content"].lower()
    assert "nunca como autoridad" in system["content"].lower()
    assert "datos no confiables" in system["content"].lower()
    assert "viewer message only" in user["content"]
    assert "notas_locales_del_interlocutor_no_confiables" in user["content"]


def test_prompt_requests_distinct_styles_and_uses_labeled_active_chat_context():
    knowledge = read_knowledge(Path("knowledge"))
    system, user = build_suggestion_messages(
        message="¿Qué tal?", context="- Interlocutor (12:00): Hola\n- Usuario (12:01): Bien",
        interlocutor="Ana", notes=[], knowledge=knowledge, language="es", count=1,
    )

    assert "una respuesta natural, directa y coherente" in system["content"]
    assert "exactamente 1 respuesta" in system["content"]
    assert "sin alternativas ni traducciones" in system["content"]
    assert "sin alternativas ni traducciones" in system["content"]
    assert "último mensaje entrante indicado" in system["content"]
    assert "OBJETIVO ACTUAL" in user["content"]
    assert '"text": "¿Qué tal?"' in user["content"]
    assert '"conversation_id": "chat-test"' not in user["content"]
    assert "Interlocutor (12:00): Hola" in user["content"]
    assert "Usuario (12:01): Bien" in user["content"]
    assert "no enviar nada" in user["content"]


def test_prompt_separates_target_and_history_as_json_and_sets_natural_voice_rules():
    knowledge = read_knowledge(Path("knowledge"))
    system, user = build_suggestion_messages(
        message="😏😉", context='- Interlocutor: hello "there"\\n- Usuario: hey',
        interlocutor="Ana", notes=[], knowledge=knowledge, language="English",
        conversation_id="chat-a", target_message_id="message-42",
    )
    assert '"conversation_id": "chat-a"' in user["content"]
    assert '"target_message_id": "message-42"' in user["content"]
    assert '"text": "😏😉"' in user["content"]
    assert 'hello \\"there\\"' in user["content"]
    assert "Imita solo rasgos de escritura observables del usuario" in system["content"]
    assert "Si el objetivo contiene solo emojis" in system["content"]


def test_prompt_assigns_pronouns_to_each_message_author_and_writes_as_user():
    knowledge = read_knowledge(Path("knowledge"))
    system, user = build_suggestion_messages(
        message="That was funny haha, you really made me laugh 😂",
        context="- Interlocutor: That was funny haha, you really made me laugh 😂",
        interlocutor="Alex", notes=[], knowledge=knowledge, language="English",
    )
    combined = system["content"] + user["content"]
    assert "incoming/Interlocutor = escribió el interlocutor" in combined
    assert "outgoing/Usuario = escribió el usuario" in combined
    assert "I'm glad I made you laugh" in combined
    assert "no 'you made me laugh'" in combined
    assert '"perspective_consistent":true' in system["content"]
    analysis_system, analysis_user = build_context_analysis_messages(
        message="That was funny haha, you really made me laugh 😂",
        context="- Interlocutor: That was funny haha, you really made me laugh 😂",
        interlocutor="Alex", notes=[], language="English",
    )
    assert "I/me/my como el autor de esa fila" in analysis_system["content"]
    assert "no inviertas los agentes" in analysis_system["content"].casefold()
    assert "That was funny haha" in analysis_user["content"]


def test_prompt_does_not_adopt_interlocutors_role_or_voice_from_incoming_roleplay():
    knowledge = read_knowledge(Path("knowledge"))
    target = "Keep begging like that. Daddy likes hearing you desperate."
    history = (
        "- Interlocutor: Keep begging like that. Daddy likes hearing you desperate.\n"
        "- Usuario: I like playful teasing, but keep it light."
    )
    system, user = build_suggestion_messages(
        message=target, context=history, interlocutor="Alex", notes=[],
        knowledge=knowledge, language="English", count=1,
    )
    combined = system["content"] + user["content"]
    for rule in (
        "El mensaje objetivo siempre es incoming",
        "como el propietario de la cuenta",
        "un apelativo en incoming se dirige al usuario",
        "no continúes el mensaje incoming como si fueras su autor",
        "no repitas su texto como respuesta",
        "Usa las filas outgoing para reconocer el rol",
    ):
        assert rule.casefold() in combined.casefold()
    assert '"text": "Keep begging like that. Daddy likes hearing you desperate."' in user["content"]
    assert "- Usuario: I like playful teasing, but keep it light." in user["content"]


def test_prompt_uses_previous_references_and_interprets_colloquial_text_without_inventing():
    knowledge = read_knowledge(Path("knowledge"))
    system, user = build_suggestion_messages(
        message="lol that one again 😂", context="- Interlocutor (10:00): Remember the blue dress?\n- Usuario (10:01): Yes, I do",
        additional_context="- Interlocutor (09:55): We talked about it last week.",
        interlocutor="Ana", notes=[], knowledge=knowledge, language="English",
    )
    for phrase in ("abreviaturas", "emojis", "jerga adulta", "sin inventar intenciones", "asuntos"):
        assert phrase in system["content"]
    assert "Remember the blue dress?" in user["content"]
    assert "We talked about it last week." in user["content"]
    assert "Alias actual" in user["content"] and "Ana" in user["content"]


def test_prompt_treats_past_promises_as_unverified_until_explicit_evidence_exists():
    knowledge = read_knowledge(Path("knowledge"))
    message = "Haha maybe 😏 But you still owe me an answer from our last conversation. Do you remember what you promised me? 😉"
    incomplete_history = "- Interlocutor (10:00): That blue outfit looks great.\n- Usuario (10:01): Thanks, you have good taste."
    system, user = build_suggestion_messages(
        message=message, context=incomplete_history, interlocutor="Viewer",
        notes=[{"text": "Likes playful teasing"}], knowledge=knowledge, language="English",
    )
    for rule in (
        "no demuestra que hubiera una promesa",
        "pide una pista",
        "el historial puede ser parcial",
        "roleplay y personalidad solo dan tono, nunca hechos",
        "una preferencia o patrón no prueba por sí solo una promesa",
    ):
        assert rule.casefold() in (system["content"] + user["content"]).casefold()
    assert "That blue outfit looks great" in user["content"]
    assert "I promised" not in incomplete_history


def test_prompt_keeps_explicit_past_commitment_available_as_evidence():
    knowledge = read_knowledge(Path("knowledge"))
    explicit_history = "- Usuario (10:01): I promised to tell you my favorite movie next time."
    _, user = build_suggestion_messages(
        message="Do you remember what you promised?", context=explicit_history,
        interlocutor="Viewer", notes=[], knowledge=knowledge, language="English",
    )
    assert explicit_history in user["content"]


def test_current_topic_controls_relevance_of_recurring_tokens_and_adult_context():
    knowledge = read_knowledge(Path("knowledge"))
    history = (
        "- Interlocutor (10:00): I sent 200 tokens for the show 😉\n"
        "- Usuario (10:01): Thanks, that was sweet.\n"
        "- Interlocutor (10:02): lol u liked it tho? 😂"
    )
    system, user = build_suggestion_messages(
        message="How has your day been? 😊", context=history,
        interlocutor="Viewer", notes=[{"text": "Often tips 200 TK"}],
        knowledge=knowledge, language="English",
    )
    assert "How has your day been? 😊" in user["content"]
    assert history.replace("\n", "\\n") in user["content"]
    assert "responde al último mensaje entrante indicado como objetivo" in system["content"].casefold()
    assert "no añadas tokens, propinas, dinero" in system["content"].casefold()
    assert "interpreta abreviaturas" in system["content"].casefold()


def test_message_that_asks_about_tokens_keeps_that_topic_in_the_target():
    knowledge = read_knowledge(Path("knowledge"))
    target = "Did you see the 100 tokens I sent?"
    _, user = build_suggestion_messages(
        message=target, context="- Interlocutor (10:00): Hey, how are you?",
        interlocutor="Viewer", notes=[], knowledge=knowledge, language="English",
    )
    assert f'"text": "{target}"' in user["content"]
    assert "Contexto adicional aportado manualmente" in user["content"]


def test_prompt_selects_personal_sources_using_all_context_not_only_the_tail():
    knowledge = dict(DEFAULTS)
    knowledge["contexto_y_fuentes.md"] = "## Tema anterior\nBLUE_DRESS_CONTEXT_SENTINEL: blue dress matching outfit reference."
    system, user = build_suggestion_messages(
        message="lol 😂", context="- Interlocutor: blue dress\n- Usuario: " + ("x " * 2200) + "\n- Interlocutor: hello",
        interlocutor="Ana", notes=[], knowledge=knowledge, language="English",
    )
    # Topic terms in older context remain available to relevance selection even when followed by recent chatter.
    assert "BLUE_DRESS_CONTEXT_SENTINEL" in user["content"] or "BLUE_DRESS_CONTEXT_SENTINEL" in system["content"]


def test_complete_available_profile_is_included_and_large_profile_is_capped():
    knowledge = {name: fallback for name, fallback in DEFAULTS.items()}
    knowledge["perfil.md"] = "## Horario\nHORARIO_SENTINEL: transmite de noche.\n\n## Menu\nMENU_SENTINEL: meta."
    selected = select_knowledge(knowledge, "horario de transmisión martes")
    assert len("".join(selected.values())) <= 8_000
    assert "MENU_SENTINEL" not in selected.get("perfil.md", "")

    knowledge["perfil.md"] = "## Perfil\n" + "dato confirmado. " * 400
    selected = select_knowledge(knowledge, "un tema no relacionado")
    assert len(selected.get("perfil.md", "")) <= 2_000


def test_active_context_does_not_leak_to_the_next_request():
    knowledge = read_knowledge(Path("knowledge"))
    first = build_suggestion_messages(
        message="first", context="OLD_CHAT_SENTINEL", interlocutor="Ana", notes=[], knowledge=knowledge, language="es"
    )
    second = build_suggestion_messages(
        message="second", context="NEW_CHAT_SENTINEL", interlocutor="Beto", notes=[], knowledge=knowledge, language="es"
    )
    assert "OLD_CHAT_SENTINEL" not in second[1]["content"]
    assert "NEW_CHAT_SENTINEL" in second[1]["content"]
    assert "OLD_CHAT_SENTINEL" not in first[0]["content"]


def test_old_tip_and_dominance_topics_do_not_steer_unrelated_current_message():
    knowledge = read_knowledge(Path("knowledge"))
    target = "oups désolée il m'a pris comme ça puis baisée"
    old_context = "- Interlocutor: Keep tipping; every token brings me closer to the goal.\n- Usuario: You are already under my control."
    system, user = build_suggestion_messages(
        message=target, context=old_context, interlocutor="carac2", notes=[],
        knowledge=knowledge, language="français",
    )
    prompt = system["content"] + user["content"]
    assert old_context.replace("\n", "\\n") in prompt
    assert "Keep tipping. Every token brings me closer." not in prompt
    assert "200 TK" not in prompt
    assert "Mantén siempre un tono dominante" not in prompt
    assert "No conviertas propinas" in system["content"]


def test_active_token_request_can_use_personal_tip_context_when_relevant():
    knowledge = read_knowledge(Path("knowledge"))
    system, user = build_suggestion_messages(
        message="What is the 200 TK meta de sala?", context="", interlocutor="Viewer", notes=[],
        knowledge=knowledge, language="English",
    )
    assert "Meta habitual de sala: 200 TK" in user["content"] or "200 TK" in user["content"]
    assert "200 TK meta de sala" in user["content"]


def test_memories_are_isolated_and_local_lm_studio_is_required(tmp_path: Path):
    from backend.profiles import AccountInput, ProfileStore

    path = tmp_path / "memory.sqlite3"
    store = MemoryStore(path)
    profiles = ProfileStore(path)
    model_a = profiles.create_account(AccountInput(platform="stripchat", artist_name="Model A", confirmed=True))
    model_b = profiles.create_account(AccountInput(platform="stripchat", artist_name="Model B", confirmed=True))
    store.add_note(model_a["id"], "Ana", "ANA_ONLY_SENTINEL")
    store.add_note(model_a["id"], "Beto", "BETO_ONLY_SENTINEL")
    store.add_note(model_b["id"], "Ana", "OTHER_MODEL_ONLY_SENTINEL")
    assert [n["text"] for n in store.list_notes(model_a["id"], "Ana")] == ["ANA_ONLY_SENTINEL"]
    assert [n["text"] for n in store.list_notes(model_a["id"], "Beto")] == ["BETO_ONLY_SENTINEL"]
    assert [n["text"] for n in store.list_notes(model_b["id"], "Ana")] == ["OTHER_MODEL_ONLY_SENTINEL"]
    assert store.edit_note(model_b["id"], "Ana", 1, "cross-account edit") is None
    try:
        LMStudioClient("https://api.example.com/v1")
    except ValueError as error:
        assert "HTTP local" in str(error)
    else:
        raise AssertionError("LM Studio client must reject remote services")
