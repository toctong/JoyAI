import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { TypeOrmCrudService } from "@dataui/crud-typeorm";
import { Repository } from "typeorm";
import * as bcrypt from "bcryptjs";
import { User } from "../../database/entities/user.entity";
import { UserRole } from "../../database/enums";

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
      this.repo.create({ username, passwordHash, role }),
    );
  }

  /** Admin list — keep plain array for existing web contract. */
  list() {
    return this.repo.find({
      select: ["id", "username", "role", "createdAt"],
      order: { createdAt: "DESC" },
    });
  }

  async require(id: string) {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException("用户不存在");
    return user;
  }
}
