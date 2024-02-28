import { PrismaClient } from "@prisma/client";
import fastify from "fastify";
import { z } from "zod";

const app = fastify();

const prisma = new PrismaClient()

// POST /clientes/:id/transacoes
app.post('/clientes/:id/transacoes', async (request, reply) => {
  console.log("⭐ POST /clientes/:id/transacoes")

  const paramsSchema = z.object({
    id: z.string()
  })

  const { id } = paramsSchema.parse(request.params)

  const cliente = await prisma.cliente.findUnique({
    where: {
      id: Number(id)
    }
  })

  if (!cliente) {
    reply.status(404)
    return { error: "Cliente não encontrado" }
  }
  
  const bodySchema = z.object({
    valor: z.number().min(0),
    tipo: z.enum(["d", "c"]),
    descricao: z.string().min(1).max(10),
  })

  const transacao = bodySchema.parse(request.body)

  if (transacao.tipo === "d") {
    if (-cliente.limite > cliente.saldo - transacao.valor) {
      reply.status(422)
      return { error: "Saldo insuficiente" }
    }

    cliente.saldo -= transacao.valor
  }
  else {
    cliente.saldo += transacao.valor
  }

  await Promise.all([
    prisma.cliente.update({
      where: {
        id: cliente.id
      },
      data: {
        saldo: cliente.saldo
      }
    }),
    prisma.transacao.create({
      data: {
        valor: transacao.valor,
        tipo: transacao.tipo,
        descricao: transacao.descricao,
        cliente: {
          connect: {
            id: cliente.id
          }
        }
      }
    })
  ])

  return {
    limite: cliente.limite,
    saldo: cliente.saldo
  }
})

// GET /clientes/:id/extrato
app.get('/clientes/:id/extrato', async (request, reply) => {
  console.log('⭐ GET /clientes/:id/extrato')

  const paramsSchema = z.object({
    id: z.string()
  })

  const { id } = paramsSchema.parse(request.params)

  const [cliente, transacoes] = await Promise.all([
    prisma.cliente.findUnique({
      where: {
        id: Number(id)
      }
    }),
    prisma.transacao.findMany({
      orderBy: {
        realizadaem: 'desc',
      },
      take: 10,
      where: {
        idcliente: Number(id)
      }
    })
  ])

  if (!cliente) {
    reply.status(404)
    return { error: "Cliente não encontrado" }
  }

  // Mapeia as transações para o formato desejado
  const ultimas_transacoes = transacoes.map(transacao => ({
    valor: transacao.valor,
    tipo: transacao.tipo,
    descricao: transacao.descricao,
    realizada_em: transacao.realizadaem.toISOString(),
  }))

  return {
    "saldo": {
      "total": cliente.saldo,
      "data_extrato": new Date().toISOString(),
      "limite": cliente.limite
    },
    "ultimas_transacoes": ultimas_transacoes
  }
})

app.listen({
  port: 8080,
  host: '0.0.0.0'
}).then(() => {
  console.log('🔥 HTTP server running!')
})