import time

NAME = "Notify SOC Team"
DESCRIPTION = "Simulates sending a high priority email notification to the SOC team."

def execute(case, db, logger):
    ip = case.source_ip
    title = case.title
    
    # Simulate network delay for email sending
    time.sleep(1.5)
    
    logger.info(f"PLAYBOOK: Email sent regarding Case #{case.id} ({title})")
    
    return f"Email sent to SOC regarding source IP {ip}."
