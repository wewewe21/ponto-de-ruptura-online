"""Compact CPU Kokoro for Ponto de Ruptura. No hosted API or credentials.

Workflow topology adapted from Apache0ne/ComfyUI-kokoro's public example.
Runtime/model: https://github.com/thewh1teagle/kokoro-onnx (MIT / Apache-2.0 weights).
"""
import os
import numpy as np
import torch
import onnxruntime as ort
import folder_paths
from kokoro_onnx import Kokoro
from scipy.signal import resample_poly
from fractions import Fraction

MODEL_DIR = os.path.join(folder_paths.models_dir, "kokoro-onnx")

class PDRKokoroModel:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"model": (["kokoro-v1.0.int8.onnx"],), "voices": (["voices-v1.0.bin"],)}}
    RETURN_TYPES = ("PDR_KOKORO",)
    FUNCTION = "load"
    CATEGORY = "Ponto de Ruptura/Vozes PT-BR"
    def load(self, model, voices):
        # Restrict this node to CPU; ComfyUI's CUDA image/video jobs keep their VRAM.
        options = ort.SessionOptions()
        options.intra_op_num_threads = min(6, os.cpu_count() or 2)
        options.inter_op_num_threads = 1
        session = ort.InferenceSession(os.path.join(MODEL_DIR, model), sess_options=options, providers=["CPUExecutionProvider"])
        return (Kokoro.from_session(session, os.path.join(MODEL_DIR, voices)),)

class PDRKokoroSpeech:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"model": ("PDR_KOKORO",), "text": ("STRING", {"multiline": True}),
            "voice_a": (["pm_alex", "pm_santa", "pf_dora"],), "voice_b": (["pm_alex", "pm_santa", "pf_dora"],),
            "blend": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 1.0, "step": 0.05}),
            "speed": ("FLOAT", {"default": 1.05, "min": 0.7, "max": 1.4, "step": 0.01}),
            "pitch_semitones": ("FLOAT", {"default": 0, "min": -3.0, "max": 3.0, "step": 0.1})}}
    RETURN_TYPES = ("AUDIO",)
    FUNCTION = "speak"
    CATEGORY = "Ponto de Ruptura/Vozes PT-BR"
    def speak(self, model, text, voice_a, voice_b, blend, speed, pitch_semitones):
        style = model.get_voice_style(voice_a) * (1 - blend) + model.get_voice_style(voice_b) * blend
        samples, rate = model.create(text.strip(), voice=style, speed=speed, lang="pt-br", trim=True)
        if pitch_semitones:
            # Small resampling shifts make recurring characters distinct; never change phonemes/language.
            ratio = Fraction(2 ** (-pitch_semitones / 12)).limit_denominator(1000)
            samples = resample_poly(samples, ratio.numerator, ratio.denominator)
        samples = np.nan_to_num(samples).astype(np.float32)
        peak = float(np.max(np.abs(samples))) if len(samples) else 0
        if peak > 0:
            samples = samples / peak * 0.82
        samples = np.pad(samples, (int(rate * 0.025), int(rate * 0.1)))
        return ({"waveform": torch.from_numpy(samples).unsqueeze(0).unsqueeze(0), "sample_rate": rate},)

NODE_CLASS_MAPPINGS = {"PDRKokoroModel": PDRKokoroModel, "PDRKokoroSpeech": PDRKokoroSpeech}
NODE_DISPLAY_NAME_MAPPINGS = {"PDRKokoroModel": "Kokoro compacto · CPU", "PDRKokoroSpeech": "Vozes de soldados · Português Brasil"}
