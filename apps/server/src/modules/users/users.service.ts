import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { TypeOrmCrudService } from "@dataui/crud-typeorm";
import { Repository } from "typeorm";
import * as bcrypt from "bcryptjs";
import { User } from "../../database/entities/user.entity";
import { UserRole } from "../../database/enums";

export type PublicUser = {
  id: string;
  username: string;
  role: UserRole;
  totpEnabled: boolean;
  createdAt: Date;
};

@Injectable()
export class UsersService extends TypeOrmCrudService<User> {
  constructor(@InjectRepository(User) repo: Repository<User>) {
    super(repo);
  }

  findByUsername(username: string) {
    return this.repo.findOne({ where: { username } });
  }

  findById(id: string) {
    return this.repo.findOne({ where: { id } });
  }

  async create(
    username: string,
    password: string,
    role: UserRole = UserRole.creator,
  ) {
    const exists = await this.findByUsername(username);
    if (exists) throw new ConflictException("用户名已存在");
    const passwordHash = await bcrypt.hash(password, 10);
    return this.repo.save(
      this.repo.create({
        username,
        passwordHash,
        role,
        totpSecret: null,
        totpEnabled: false,
      }),
    );
  }

  toPublic(user: User): PublicUser {
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      totpEnabled: Boolean(user.totpEnabled),
      createdAt: user.createdAt,
    };
  }

  /** Admin list — keep plain array for existing web contract. */
  async list(): Promise<PublicUser[]> {
    const rows = await this.repo.find({
      select: ["id", "username", "role", "totpEnabled", "createdAt"],
      order: { createdAt: "DESC" },
    });
    return rows.map((u) => this.toPublic(u));
  }

  async require(id: string) {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException("用户不存在");
    return user;
  }

  async updateRole(id: string, role: UserRole, actorId: string) {
    const user = await this.require(id);
    if (user.id === actorId && role !== UserRole.admin) {
      throw new BadRequestException("不能取消自己的管理员角色");
    }
    if (user.role === UserRole.admin && role !== UserRole.admin) {
      await this.assertNotLastAdmin(user.id);
    }
    user.role = role;
    return this.toPublic(await this.repo.save(user));
  }

  async resetPassword(id: string, password: string) {
    if (!password || password.length < 6) {
      throw new BadRequestException("密码至少 6 位");
    }
    const user = await this.require(id);
    user.passwordHash = await bcrypt.hash(password, 10);
    await this.repo.save(user);
    return this.toPublic(user);
  }

  async removeUser(id: string, actorId: string) {
    const user = await this.require(id);
    if (user.id === actorId) {
      throw new BadRequestException("不能删除当前登录账号");
    }
    if (user.role === UserRole.admin) {
      await this.assertNotLastAdmin(user.id);
    }
    await this.repo.remove(user);
    return { ok: true };
  }

  async setTotpSecret(userId: string, secret: string | null) {
    const user = await this.require(userId);
    user.totpSecret = secret;
    // New secret or clear → must re-confirm before enabled
    user.totpEnabled = false;
    return this.repo.save(user);
  }

  async setTotpEnabled(userId: string, enabled: boolean) {
    const user = await this.require(userId);
    if (enabled && !user.totpSecret) {
      throw new BadRequestException("请先完成验证器绑定");
    }
    user.totpEnabled = enabled;
    if (!enabled) {
      // Keep secret until re-setup clears it — caller may clear explicitly
    }
    return this.repo.save(user);
  }

  async disableTotp(userId: string) {
    const user = await this.require(userId);
    user.totpEnabled = false;
    user.totpSecret = null;
    return this.repo.save(user);
  }

  private async assertNotLastAdmin(exceptId: string) {
    const count = await this.repo.count({
      where: { role: UserRole.admin },
    });
    if (count <= 1) {
      throw new ForbiddenException("不能移除最后一个管理员");
    }
    void exceptId;
  }
}
