import subprocess
import time

NAME = "Block IP via iptables"
DESCRIPTION = "Extracts the source IP from the case and blocks it locally using iptables."

def execute(case, db, logger):
    ip = case.source_ip
    if not ip:
        raise ValueError("No source IP found in this case.")

    # Execute iptables block
    try:
        result = subprocess.run(
            ["iptables", "-A", "INPUT", "-s", ip, "-j", "DROP"],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0:
            logger.info(f"PLAYBOOK: Block IP {ip} successful.")
            return f"Successfully blocked IP {ip} via iptables."
        else:
            raise RuntimeError(f"iptables error: {result.stderr.strip()}")
    except FileNotFoundError:
        # Simulate success for testing if iptables is not installed (e.g. non-root or mac)
        time.sleep(1)
        return f"[Simulated] Blocked IP {ip}."
    except subprocess.TimeoutExpired:
        raise RuntimeError("iptables command timed out.")
