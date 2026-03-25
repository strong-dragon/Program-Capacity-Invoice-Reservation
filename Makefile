.PHONY: start stop logs

start:
	@docker info > /dev/null 2>&1 || (echo "Error: Docker is not running. Please start Docker Desktop first." && exit 1)
	@cp -n .env.example .env 2>/dev/null || true
	@docker compose up -d
	@echo ""
	@echo "Waiting for services to start..."
	@sleep 10
	@npm install --silent
	@npm run start:dev &
	@sleep 5
	@echo ""
	@echo "Ready! Open in browser:"
	@echo "  http://localhost:3000/api"
	@echo ""
	@echo "Login: admin / admin"

stop:
	@echo "Stopping server and Docker..."
	@pkill -f "nest start" 2>/dev/null || true
	@pkill -f "node.*dist/main" 2>/dev/null || true
	@docker compose down
	@echo "Done!"

logs:
	@docker compose logs -f
